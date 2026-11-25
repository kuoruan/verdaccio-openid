---
"verdaccio-openid": minor
---

Hand the UI credentials to the browser instead of putting them in the redirect URL: the login is bound to the browser that started it with an HttpOnly cookie, the redirect carries a single-use code, and the credentials are fetched with a same-origin `POST /-/oauth/session` that presents that cookie. The npm WebAuth login is bound the same way. Pending credentials live under their own key in the configured store; Redis, MongoDB and DynamoDB consume them in one operation, the in-memory store only covers its own process, and the file store reads and then deletes without a lock, so use it with a single Verdaccio process.

<!-- zh-CN -->

登录凭证不再放在重定向 URL 里，而是交给发起登录的浏览器：HttpOnly cookie 绑定浏览器，重定向只带一次性 code，浏览器再用同源 `POST /-/oauth/session` 出示该 cookie 领取凭证。npm WebAuth 登录同样绑定。待领取的凭证存放在所配存储的独立 key 下；Redis、MongoDB 和 DynamoDB 以一次操作取出并删除，in-memory 仅覆盖本进程，file 后端先读后删且无锁，单进程使用。
