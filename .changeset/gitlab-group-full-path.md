---
"verdaccio-openid": minor
---

Match GitLab groups by their full path rather than their name.

With `provider-type: gitlab`, the groups of a user were read from the group _name_. A name is not unique and not reserved: anyone who is allowed to create a group could create one named like a group they are not a member of and match `authorized-groups` with it. Groups now come from the full path, which GitLab keeps unique (`team/backend`, or `backend` for a top-level group).

This needs an update where configured group names are not full paths. Top-level groups are unaffected, because their name and path usually agree. A group configured as `backend` that lives inside `team` has to become `team/backend` in `authorized-groups` and `group-users`, both in the `auth` and the `middlewares` sections.

<!-- zh-CN -->

GitLab 组按完整路径而非组名匹配。

`provider-type: gitlab` 时用户组取自组名，但组名不唯一、也不保留：有建组权限的人可以建一个与目标组同名的组来匹配 `authorized-groups`。现在组取自 GitLab 保证唯一的完整路径（`team/backend`，顶层组为 `backend`）。

组名不是完整路径的配置需要更新。顶层组不受影响，因为名称与路径通常一致。位于 `team` 下、配置为 `backend` 的组，需要在 `auth` 与 `middlewares` 两个 section 的 `authorized-groups` 和 `group-users` 里都改成 `team/backend`。
