---
"verdaccio-openid": patch
---

Harden the client against bad input from the login redirect, and fix the messages the review turned up. A link that carries no valid tokens no longer stores them, and the token command quotes the token instead of interpolating it. A malformed query string no longer stops the login button from being taken over. The state error now also mentions expiry, and the CLI usage hint says "a public npm registry or mirror".

<!-- zh-CN -->

收紧客户端对登录回跳参数的校验，并修正评审发现的提示文案。回跳链接里的 token 不是合法 token 时不再写入存储，token 命令改用单引号包裹而不是直接插值。畸形查询串不再导致登录按钮的接管失效。state 错误提示补充“可能已过期”，CLI 用法提示改为「a public npm registry or mirror」。
