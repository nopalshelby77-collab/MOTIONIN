import 'dotenv/config';
import express from 'express';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const MAX_XML_BYTES = 5 * 1024 * 1024; // 5 MB

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') ||
      normalized.startsWith('ff')
    ) {
      return true;
    }
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.slice(7);
      return isPrivateOrReservedIp(v4Part);
    }
    return false;
  }

  return true;
}

async function validateExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_PROTOCOL');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('BLOCKED_HOST');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('BLOCKED_HOST');
    }
    return parsed;
  }

  const records = await dns.lookup(hostname, {all: true});
  if (!records || records.length === 0) {
    throw new Error('DNS_FAILED');
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error('BLOCKED_HOST');
    }
  }

  return parsed;
}

async function fetchXmlWithSafeRedirects(startUrl: string): Promise<{
  text: string;
  contentType: string;
  finalUrl: string;
}> {
  let currentUrl = startUrl;

  for (let hop = 0; hop < 4; hop++) {
    const validated = await validateExternalUrl(currentUrl);
    const response = await fetch(validated.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/xml, text/xml, image/svg+xml, text/plain;q=0.8, */*;q=0.5',
        'User-Agent': 'VectorAMStudio-XMLFetcher/1.0',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('FETCH_FAILED');
      }
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    if (!response.ok) {
      const err = new Error(`HTTP_${response.status}`);
      throw err;
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_XML_BYTES) {
      throw new Error('TOO_LARGE');
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_XML_BYTES) {
      throw new Error('TOO_LARGE');
    }

    const text = new TextDecoder('utf-8').decode(buffer);
    const contentType = response.headers.get('content-type') || 'application/xml';
    return {text, contentType, finalUrl: validated.toString()};
  }

  throw new Error('TOO_MANY_REDIRECTS');
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '64kb'}));

  app.post('/api/fetch-xml', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!rawUrl.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'EMPTY_URL',
        message: 'URL XML tidak boleh kosong.',
      });
    }

    try {
      const result = await fetchXmlWithSafeRedirects(rawUrl);
      const trimmed = result.text.replace(/^\uFEFF/, '').trim();
      if (!trimmed.startsWith('<')) {
        return res.status(422).json({
          ok: false,
          code: 'NOT_XML',
          message:
            'Konten dari URL bukan dokumen XML atau SVG yang valid (tidak diawali tag XML).',
        });
      }

      return res.json({
        ok: true,
        xml: result.text,
        contentType: result.contentType,
        finalUrl: result.finalUrl,
        byteLength: Buffer.byteLength(result.text, 'utf8'),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'FETCH_FAILED';
      let status = 502;
      let message =
        'Gagal mengambil file dari URL tersebut. Anda dapat mengunduh file lalu mengunggahnya secara manual.';

      if (code === 'INVALID_URL' || code === 'INVALID_PROTOCOL') {
        status = 400;
        message = 'Format URL tidak valid. Gunakan protokol http:// atau https://.';
      } else if (code === 'BLOCKED_HOST') {
        status = 403;
        message = 'Alamat host lokal atau jaringan privat tidak diizinkan demi keamanan.';
      } else if (code === 'TOO_LARGE') {
        status = 413;
        message = 'Ukuran file melebihi batas maksimum 5 MB.';
      } else if (code === 'TimeoutError' || code === 'AbortError') {
        status = 504;
        message = 'Waktu koneksi ke URL habis (timeout). Silakan coba upload file secara manual.';
      } else if (code.startsWith('HTTP_')) {
        status = 502;
        message = `Server sumber mengembalikan status ${code.replace('HTTP_', '')}. Pastikan link bersifat publik atau upload file secara manual.`;
      }

      return res.status(status).json({
        ok: false,
        code,
        message,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VECTOR AM STUDIO server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
