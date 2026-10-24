# dsh-settings-button

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
[![install](https://img.shields.io/badge/install-dsh%20plugin%20add-4D6BFE?style=flat-square)](#installation)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

一个齿轮按钮，直接打开 **DeepSeek Harness（DSH）** 的设置面板 —— 桌面端、手机端、局域网访问都一次点击直达。

A gear button that opens the **DeepSeek Harness (DSH)** Settings dialog in one click — on desktop, on a phone, and over the LAN.

---

## 为什么需要它 / Why

DSH 默认没有独立的设置按钮。桌面端可以按快捷键，但在**手机上通过局域网访问 Web GUI 时没有键盘**，想进设置只能：点开左下角的账号菜单 → 再点菜单里的「设置」。每次两步。

DSH ships no standalone Settings button. On desktop you can press a shortcut, but when you open the Web GUI **from a phone over the LAN there is no keyboard**, so reaching Settings means opening the account menu first and picking “Settings” from it. Two steps, every time.

This plugin puts a gear right next to the phone number and opens Settings directly.

---

## 功能 / Features

- 齿轮位于侧边栏账号行右侧，紧挨手机号 / Gear sits right of the account row
- 一次点击直达设置面板 / One click, straight into Settings
- 桌面端与移动端行为一致 / Identical behaviour on desktop and mobile
- 纯前端状态，局域网设备同样可用 / Pure browser state, works from any LAN device
- 收起侧边栏（rail 模式）下自动缩为图标 / Collapses to an icon in rail mode
- 不挤占同区域其他插件的控件 / Does not displace other plugins' controls in the same row

## 安装 / Installation

从 GitHub 直接安装（本包尚未发布到 npm / not on npm yet）：

```bash
dsh plugin add github:REALOIYO/dsh-settings-button
```

或在 DSH profile 目录（通常是 `~/.dsh/profiles/desktop`）中：

```bash
pnpm add github:REALOIYO/dsh-settings-button
```

然后确认它出现在 `package.json` 的 `dsh.profile.bundles` 数组里 —— **不在该数组中宿主不会加载它**。重启 DSH 生效。

Install straight from GitHub (this package is not on npm yet):

```bash
dsh plugin add github:REALOIYO/dsh-settings-button
```

Then make sure it is listed in `dsh.profile.bundles` in your profile's `package.json` — **the host does not load bundles that are absent from that array**. Restart DSH to take effect.

> 发布到 npm 之后，上面的命令可以简写为 `dsh plugin add dsh-settings-button`。
> Once published to npm, that shortens to `dsh plugin add dsh-settings-button`.

## 卸载 / Removal

```bash
pnpm remove dsh-settings-button
```

并从 `dsh.profile.bundles` 中移除对应条目，重启 DSH。

## 工作原理 / How it works

设置面板的状态由一个私有 store 持有，插件无法直接访问。可用的入口有两个：

1. 宿主在 `shortcuts` 服务上注册的 `settings.open` 命令
2. `settings.launcher` slot 传给组件的 `openSettings` prop —— 但该 slot 是 `single`，已被账号菜单占用

本插件走第 1 条：`ShortcutsService` 没有转发 `invoke`，但它的 `registry` 字段在运行时只是一个普通属性，因此 `ctx.shortcuts.registry.invoke('settings.open', { modal })` 可以直达 `actions.open()`。若宿主将来收紧该字段，会自动回退到驱动账号菜单的方式，按钮不会彻底失效。

The settings shell keeps its open state in a private store. Two entry points exist: the host's `settings.open` command, and the `openSettings` prop passed to `settings.launcher` — but that slot is `single` and already claimed by the account menu. This plugin uses the command: `ShortcutsService` does not forward `invoke`, yet its `registry` field is an ordinary property at runtime, so `ctx.shortcuts.registry.invoke('settings.open', { modal })` reaches `actions.open()` directly. If the host ever hardens that field, the button falls back to driving the account menu instead of breaking.

## 兼容性 / Compatibility

- 面向 DSH `0.2.1-rc.3` 开发 / Built against DSH `0.2.1-rc.3`
- 与 `0.2.1-rc.2` 及更早版本兼容（定位逻辑带逐级回落）
  / Works on `0.2.1-rc.2` and earlier too — the locator falls back step by step
- 不绑定键盘快捷键，局域网设备可用 / No keyboard shortcut involved

### 定位策略 / How the row is located

`0.2.1-rc.3` 给侧边栏新增了一个「更多」按钮，它**同样**带
`aria-label` + `aria-haspopup="menu"`，且在文档顺序上排在账号行之前。
旧版用 `document.querySelector('button[aria-haspopup="menu"][aria-label]')`
取全局首个匹配，于是齿轮被挂到了「更多」旁边。

`0.2.1-rc.3` added a sidebar **More** button that carries the *same*
`aria-label` + `aria-haspopup="menu"` pair and appears **earlier in document
order**. The old locator took the first global match, so the gear got portalled
next to More instead of into the account row.

v1.0.1 起改为三级定位，每级都做了作用域收敛：

Since v1.0.1 the locator is three-tiered, each tier scoped:

| 顺序 | 选择器 | 唯一性依据 |
|---|---|---|
| 1 | `button[data-signed-out]` | 账号行无条件渲染该属性（登录时为字符串 `"false"`），「更多」按钮没有 |
| 2 | `[class*="settingsArea"] button[aria-haspopup="menu"]` | 限定在 `sidebar.settings` 槽位容器内 |
| 3 | 全局 `aria-haspopup` 匹配，但排除 `footerActions` 内的元素 | 兼容旧宿主 |

> 第 2 级用了 `[class*="settingsArea"]` 属性子串匹配，因为该 class 由 CSS Module
> 编译带哈希前缀（实际为 `wtg9ga_settingsArea`）。**子串匹配在宿主改变命名时仍有效**，
> 但它确实是一个类名依赖 —— 与「完全不依赖类名」的旧表述不同，特此更正。

> Tier 2 relies on a `[class*="settingsArea"]` substring match because the class
> is CSS-Module-hashed (actually `wtg9ga_settingsArea`). It survives renames, but it
> *is* a class-name dependency — correcting the earlier "no class-name dependency"
> claim.

## 许可 / License

[MIT](LICENSE)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
