// functions/mcstatus.js
// Cloudflare Pages Functions：用 Minecraft Server List Ping 协议直连游戏服务器，
// 返回真实在线数据 + 真实网络延迟，替代第三方 api.mcsrvstat.us。
// Pages 部署时自动检测 functions/ 目录，同源路由 /mcstatus 即本函数，无需额外配置。

import { connect } from "cloudflare:sockets";

const SERVER_HOST = "mc233.xin"; // 游戏服务器地址
const SERVER_PORT = 25565;       // Java 版端口
const CACHE_TTL = 90;            // 缓存 90 秒，防止高频请求打爆游戏服务器端口

// Minecraft 协议：无符号 VarInt 编码
function writeVarInt(num) {
  const bytes = [];
  do {
    let b = num & 0x7f;
    num = Math.floor(num / 128);
    if (num > 0) b |= 0x80;
    bytes.push(b);
  } while (num > 0);
  return bytes;
}

// 执行 Server List Ping：握手(状态) → 状态请求 → 读 JSON 响应，返回 { data, latency }
async function pingMcServer() {
  const encoder = new TextEncoder();
  const hostBytes = encoder.encode(SERVER_HOST);

  // 握手包（packet id=0x00, 协议版本, 服务器地址, 端口, 下一状态=1 状态查询）
  const handshakePayload = [
    0x00,
    ...writeVarInt(47),
    ...writeVarInt(hostBytes.length),
    ...hostBytes,
    (SERVER_PORT >> 8) & 0xff,
    SERVER_PORT & 0xff,
    0x01,
  ];
  const statusRequest = [...writeVarInt(1), 0x00]; // 状态请求（packet id=0x00）

  const socket = connect({ hostname: SERVER_HOST, port: SERVER_PORT });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const started = Date.now();

  // 发送：握手(带长度前缀) + 状态请求
  await writer.write(new Uint8Array([...writeVarInt(handshakePayload.length), ...handshakePayload]));
  await writer.write(new Uint8Array(statusRequest));

  // 逐字节读取响应
  let buf = new Uint8Array(0);
  async function readByte() {
    while (buf.length === 0) {
      const { value } = await reader.read();
      if (!value) throw new Error("连接被服务器关闭");
      buf = value;
    }
    const b = buf[0];
    buf = buf.slice(1);
    return b;
  }
  async function readVarInt() {
    let val = 0, shift = 0;
    while (true) {
      const b = await readByte();
      val |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error("VarInt 过长");
    }
    return val;
  }

  await readVarInt(); // 数据包长度（跳过）
  await readByte();   // packet id（状态响应为 0x00，跳过）
  const strLen = await readVarInt(); // JSON 字符串长度
  const bytes = [];
  for (let i = 0; i < strLen; i++) bytes.push(await readByte());
  const payload = new TextDecoder().decode(new Uint8Array(bytes));
  const latency = Date.now() - started;

  try { writer.close(); } catch (e) { /* 忽略关闭异常 */ }
  return { data: JSON.parse(payload), latency };
}

// 递归提取 MOTD 纯文本（兼容深层嵌套的 extra 结构）
function extractText(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object") {
    let out = node.text || "";
    if (node.extra) out += extractText(node.extra);
    return out;
  }
  return "";
}

export async function onRequestGet(context) {
  const cacheKey = "https://frostcraft.internal/mcstatus";
  const cache = caches.default;

  // 90 秒缓存：所有访客共享结果，不重复向游戏服务器发包
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const { data, latency } = await pingMcServer();
    const motdClean = extractText(data.description)
      .replace(/\u00a7[0-9a-fk-or]/g, "") // 去掉 § 颜色/格式代码
      .trim();
    const result = {
      online: true,
      ping_ms: latency, // 真实网络延迟（毫秒）
      version: typeof data.version === "object" ? data.version.name : data.version,
      players: {
        online: (data.players && data.players.online) || 0,
        max: (data.players && data.players.max) || 100,
        list: ((data.players && data.players.sample) || []).map((p) => ({ name: p.name })),
      },
      motd: { clean: motdClean },
    };
    const resp = new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
      },
    });
    context.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) {
    // 失败时返回兼容旧前端的数据结构，前端显示"离线"并回退文案
    return new Response(
      JSON.stringify({ online: false, ping_ms: null, error: "无法连接游戏服务器: " + e.message }),
      {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        status: 503,
      }
    );
  }
}
