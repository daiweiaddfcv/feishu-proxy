import FormData from 'form-data';

let cachedToken = null;
let tokenExpireAt = 0;

const appId = 'cli_a6690ce77472500e';
const appSecret = 'JPDFQ4tWZHQRD2gh9B1Dhfukxe1rqX0c';

async function getTenantAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpireAt > now + 60 * 1000) {
    console.log('[upload-image] 使用缓存 token');
    return cachedToken;
  }
  console.log('[upload-image] 请求新的 tenant_access_token');
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });
  const data = await res.json();
  console.log('[upload-image] tenant_access_token 响应:', data);
  if (data.tenant_access_token) {
    cachedToken = data.tenant_access_token;
    tokenExpireAt = now + (data.expire * 1000);
    return cachedToken;
  } else {
    throw new Error('获取 tenant_access_token 失败: ' + (data.msg || JSON.stringify(data)));
  }
}

export default async function handler(req, res) {
  console.log('[upload-image] handler 进入, method:', req.method);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('[upload-image] 预检请求 OPTIONS');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.warn('[upload-image] 非法请求方法:', req.method);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { base64 } = req.body;
  if (!base64) {
    console.error('[upload-image] 缺少 base64 参数');
    res.status(400).json({ success: false, message: '缺少 base64 参数' });
    return;
  }

  try {
    console.log('[upload-image] 开始处理图片上传, base64 长度:', base64.length);
    const token = await getTenantAccessToken();
    // 用 form-data 构造 multipart/form-data
    const form = new FormData();
    form.append('file_name', 'component.png');
    form.append('parent_type', 'explorer');
    form.append('parent_node', '0');
    form.append('file', Buffer.from(base64, 'base64'), {
      filename: 'component.png',
      contentType: 'image/png'
    });

    console.log('[upload-image] 开始请求飞书 drive/v1/files/upload_all');
    const resp = await fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_all', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        ...form.getHeaders()
      },
      body: form
    });
    const data = await resp.json();
    console.log('[upload-image] 飞书 drive/v1/files/upload_all 响应:', data);
    if (data.code === 0 && data.data && data.data.file_token) {
      console.log('[upload-image] 成功获取 file_token:', data.data.file_token);
      res.status(200).json({ success: true, file_token: data.data.file_token });
    } else {
      console.error('[upload-image] 上传失败，响应:', data);
      res.status(500).json({ success: false, message: data.msg || '上传失败', feishu: data });
    }
  } catch (e) {
    console.error('[upload-image] 处理异常:', e, e?.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: e.message, stack: e.stack });
    }
  }
}
