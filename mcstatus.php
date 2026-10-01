<?php
/**
 * mcstatus.php — FrostCraft 服务器状态接口（自建，替代 mcsrvstat.us）
 *
 * 实现 Minecraft Java Edition 服务器列表 Ping 协议（Server List Ping），
 * 直接从游戏服务器获取：在线状态、版本、在线人数/名单、MOTD、真实网络延迟。
 *
 * 使用方式：
 *   1. 上传本文件到网站根目录（与 index.html 同级）
 *   2. 浏览器直接访问 https://你的域名/mcstatus.php 可看到 JSON
 *   3. 前端 script.js 已改为请求 ./mcstatus.php，无需其他配置
 *
 * 依赖：PHP >= 5.3，需要 allow_url_fopen 或 sockets 均可（使用 stream_socket_client）
 * 缓存：结果写入同目录 mc_cache.json，90 秒内直接返回缓存，避免高频请求游戏服务器
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

// ===== 配置（按需修改） =====
define('MC_HOST', 'mc233.xin');      // 服务器地址
define('MC_PORT', 25565);            // Java 版端口
define('CACHE_TTL', 90);             // 缓存秒数
define('CACHE_FILE', __DIR__ . '/mc_cache.json');
define('PROTOCOL_VERSION', 769);     // 任意支持版本即可，服务器会忽略并响应状态

// ===== 有缓存且未过期 → 直接返回 =====
if (is_file(CACHE_FILE)) {
    $mtime = @filemtime(CACHE_FILE);
    if ($mtime !== false && (time() - $mtime) < CACHE_TTL) {
        echo file_get_contents(CACHE_FILE);
        exit;
    }
}

// ===== 查询游戏服务器 =====
$result = mc_status_query(MC_HOST, MC_PORT);

// 写缓存（成功、失败都缓存，防止打爆游戏服务器）
@file_put_contents(CACHE_FILE, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;

// ======================= 协议实现 =======================

/**
 * 执行 Minecraft Server List Ping，返回与 mcsrvstat.us 兼容的数据结构
 */
function mc_status_query($host, $port, $timeout = 4)
{
    $t0 = microtime(true);
    $errno = 0;
    $errstr = '';

    $sock = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $errstr, $timeout);
    if (!$sock) {
        return array('online' => false, 'error' => '无法连接服务器端口（' . $errstr . '）');
    }
    stream_set_timeout($sock, $timeout);

    // ---- 握手包：packet_id=0x00, protocol, host, port, next_state=1 ----
    $handshake = chr(0x00)
        . mc_varint(PROTOCOL_VERSION)
        . mc_varint(strlen($host)) . $host
        . pack('n', $port)
        . mc_varint(1);

    // ---- 状态请求包：packet_id=0x00（无内容） ----
    $statusReq = chr(0x00);

    // 发送：<握手长度><握手><状态请求长度><状态请求>
    $payload = mc_varint(strlen($handshake)) . $handshake . mc_varint(strlen($statusReq)) . $statusReq;
    fwrite($sock, $payload);

    // ---- 读取响应 ----
    $packetLen = mc_read_varint($sock);
    if ($packetLen === null) {
        fclose($sock);
        return array('online' => false, 'error' => '服务器未响应状态请求');
    }
    $buf = '';
    $need = $packetLen;
    while ($need > 0 && !feof($sock)) {
        $chunk = fread($sock, $need);
        if ($chunk === false || $chunk === '') break;
        $buf .= $chunk;
        $need -= strlen($chunk);
    }
    fclose($sock);

    // 跳过 packet id
    $pos = 0;
    if (mc_read_varint_from($buf, $pos) === null) {
        return array('online' => false, 'error' => '响应解析失败（packet id）');
    }
    // JSON 字符串长度
    $jsonLen = mc_read_varint_from($buf, $pos);
    if ($jsonLen === null || $jsonLen <= 0 || $jsonLen > 65535) {
        return array('online' => false, 'error' => '响应数据异常');
    }
    $jsonStr = substr($buf, $pos, $jsonLen);
    $status = json_decode($jsonStr, true);
    if (!is_array($status)) {
        return array('online' => false, 'error' => '服务器返回数据解析失败');
    }

    $t1 = microtime(true);

    // ---- 标准化为前端兼容格式 ----
    $out = array(
        'online'   => true,
        'ip'       => $host,
        'port'     => $port,
        'hostname' => $host,
        'ping_ms'  => round(($t1 - $t0) * 1000, 1), // 服务器到游戏服的真实协议往返延迟
        'error'    => null,
    );
    $out['version'] = isset($status['version']['name']) ? (string)$status['version']['name'] : '未知版本';
    $out['protocol'] = isset($status['version']['protocol']) ? (int)$status['version']['protocol'] : 0;

    if (isset($status['players']) && is_array($status['players'])) {
        $out['players'] = array(
            'online' => isset($status['players']['online']) ? (int)$status['players']['online'] : 0,
            'max'    => isset($status['players']['max']) ? (int)$status['players']['max'] : 0,
            'list'   => isset($status['players']['sample']) && is_array($status['players']['sample'])
                        ? $status['players']['sample']
                        : array(),
        );
    } else {
        $out['players'] = array('online' => 0, 'max' => 0, 'list' => array());
    }

    $out['motd'] = array(
        'clean' => mc_clean_motd(isset($status['description']) ? $status['description'] : null),
    );
    return $out;
}

/** 编码 VarInt */
function mc_varint($n)
{
    $out = '';
    do {
        $b = $n & 0x7F;
        $n >>= 7;
        if ($n > 0) $b |= 0x80;
        $out .= chr($b);
    } while ($n > 0);
    return $out;
}

/** 从 socket 读取 VarInt */
function mc_read_varint($sock)
{
    $num = 0;
    $shift = 0;
    while (true) {
        $byte = fread($sock, 1);
        if ($byte === false || $byte === '') return null;
        $b = ord($byte);
        $num |= ($b & 0x7F) << $shift;
        if (($b & 0x80) === 0) break;
        $shift += 7;
        if ($shift > 35) return null;
    }
    return $num;
}

/** 从缓冲区读取 VarInt（pos 为引用游标） */
function mc_read_varint_from($data, &$pos)
{
    $num = 0;
    $shift = 0;
    $len = strlen($data);
    while (true) {
        if ($pos >= $len) return null;
        $b = ord($data[$pos]);
        $pos++;
        $num |= ($b & 0x7F) << $shift;
        if (($b & 0x80) === 0) break;
        $shift += 7;
        if ($shift > 35) return null;
    }
    return $num;
}

/** 清理 MOTD 颜色码，返回数组（兼容 mcsrvstat.us 的 motd.clean） */
function mc_clean_motd($desc)
{
    $text = '';
    mc_extract_text($desc, $text);
    $clean = preg_replace('/§[0-9a-fk-or]/i', '', trim((string)$text));
    if ($clean === '') return array('无描述');
    return array($clean);
}

/** 递归提取 MOTD 富文本（兼容深层 extra 嵌套结构） */
function mc_extract_text($node, &$out)
{
    if (is_string($node)) {
        $out .= $node;
        return;
    }
    if (!is_array($node)) return;
    if (isset($node['text'])) $out .= (string)$node['text'];
    if (isset($node['extra']) && is_array($node['extra'])) {
        foreach ($node['extra'] as $part) {
            mc_extract_text($part, $out);
        }
    }
}
