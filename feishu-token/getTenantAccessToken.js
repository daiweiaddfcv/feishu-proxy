   import fetch from 'node-fetch';

   const APP_ID = 'cli_a6690ce77472500e';
   const APP_SECRET = 'JPDFQ4tWZHQRD2gh9B1Dhfukxe1rqX0c';

   export default async function getTenantAccessToken() {
     const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         app_id: APP_ID,
         app_secret: APP_SECRET
       })
     });
     const data = await resp.json();
     if (data.code === 0) {
       return data.tenant_access_token;
     } else {
       throw new Error('获取 tenant_access_token 失败: ' + data.msg);
     }
   }
