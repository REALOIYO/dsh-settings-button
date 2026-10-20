// dsh-settings-button — browser half, wrapped for the DSH client loader.
//
// The shell's loader evaluates plugin bundles as classic scripts through
// window.__ModuleLoader__.load and reads module.exports; a bare `export`
// statement is a syntax error there and the whole entry fails to import. This
// wrapper supplies the CJS shape, same as dsh-web-restart and the shipped
// bundles.
//
// ── PLACEMENT ─────────────────────────────────────────────────────────────
//
// The sidebar foot is two stacked full-width rows:
//
//   footArea        flex-direction: column
//   ├── footerActions  width:100%; display:flex   ← renderSlot("sidebar.footer.action")
//   └── settingsArea   width:100%                 ← renderSlot("sidebar.settings")
//
// `sidebar.footer.action` is a LIST slot and `footerActions` is a flex ROW with
// no wrap, so every registrant lands side by side on one line. Other plugins put
// full-width controls there (dsh-ui-usage-billing at order -10, dsh-web-restart
// at -100), and a sibling claiming `width:100%` pushed them out of the row —
// that is what made the billing gauge disappear.
//
// So this button does not render into `footerActions` at all. It registers on
// `sidebar.footer.action` only to get a mount/unmount hook from the slot
// lifecycle, returns null there, and portals the real button into the account
// row's container in `settingsArea` — placing it to the right of the phone
// number. The host's account button is left as the flex grower, so this button
// only takes its own 36px.
//
// ── HOW THE DIALOG OPENS ──────────────────────────────────────────────────
//
// `@deepseek-ai/dsh-client-ui-settings-general` registers, inside its
// `sidebar.settings` inject:
//
//   ctx.shortcuts.register({
//     id: "settings.open",
//     modals: ["settings"],
//     resolve: ({ modal }) => {
//       if (modal !== null && modal !== "settings") return { status: "blocked" }
//       return { status: "handled", run: () => {
//         if (modal === "settings") closeTopModal(document)
//         else shellInstance.actions.open()      // ← opens the dialog
//       }}
//     }
//   })
//
// `ShortcutsService` does not re-export `invoke`; that method lives on its
// `registry` field. That field is a TypeScript `private`, which erases at
// runtime — it is an ordinary own property, so `ctx.shortcuts.registry.invoke`
// is reachable. The signature is:
//
//   invoke(id, context) {
//     const command = this.commands.get(id)
//     if (command === void 0 || context.modal !== null && !command.modals.includes(context.modal)) return
//     const result = command.resolve({ ...context, source: "menu" })
//     if (result.status === "handled") result.run()
//   }
//
// Passing `modal: null` runs the `actions.open()` branch directly: no menu
// round-trip, no dependency on CSS hashes, on `data-signed-out`, on menu item
// wording, or on which account-menu component happens to be mounted.
//
// If the host ever hardens that field, `open()` falls back to driving the
// account menu, so the button keeps working across host upgrades.
window.__ModuleLoader__.load({
  id: 'dsh-settings-button',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var ReactDOM = require('react-dom');
    var inject = ['slots', 'shortcuts'];

    /** Marks the injected trigger so the click probe can skip it. */
    var ATTR = 'data-dsh-settings-button';

    /** Same marker the host's keyboard dispatcher reads to name the top modal. */
    var MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="dialog"][data-shortcut-modal]';

    /** Localized labels for the account menu's settings item. */
    var SETTINGS_LABELS = ['设置', 'Settings', '設定', '偏好设置', 'Preferences'];

    /** Class put on the account row's container so our styles can lay it out. */
    var HOST_CLASS = 'dsb-account-host';

    /**
     * Name the topmost modal the way `dsh-client-shortcuts` does before dispatch:
     * the last matching dialog wins and its `data-shortcut-modal` names it. A
     * dialog without the attribute counts as "other" (i.e. blocking).
     */
    function currentModal() {
      if (typeof document === 'undefined' || !document.querySelectorAll) return null;
      var dialogs;
      try {
        dialogs = document.querySelectorAll(MODAL_SELECTOR);
      } catch (e) {
        return null;
      }
      var top = dialogs[dialogs.length - 1];
      if (top === undefined) return null;
      return top.dataset.shortcutModal || 'other';
    }

    /** True when a menu entry's text starts with one of the settings labels. */
    function isSettingsItem(node) {
      var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === '') return false;
      for (var i = 0; i < SETTINGS_LABELS.length; i++) {
        if (text.indexOf(SETTINGS_LABELS[i]) === 0) return true;
      }
      return false;
    }

    /** Click the settings item in an already-open popup; true when clicked. */
    function pickSettingsItem() {
      if (typeof document === 'undefined' || !document.querySelectorAll) return false;
      var items = document.querySelectorAll('[role="menuitem"], [role="option"]');
      for (var i = 0; i < items.length; i++) {
        var node = items[i];
        if (node === null || node.hasAttribute(ATTR)) continue;
        if (!isSettingsItem(node)) continue;
        try {
          node.click();
          return true;
        } catch (e) {
          /* try the next candidate */
        }
      }
      return false;
    }

    /**
     * Locate the container that holds the account row. The account plugin owns
     * that subtree, so this only reads structure: the row is the menu trigger
     * inside `sidebar.settings`, and its parent is the box we portal into.
     *
     * `data-signed-out` is present in both states (React renders it as the
     * string "false" when signed in), but `aria-haspopup="menu"` is the
     * semantic marker and survives a rename of the data attribute, so prefer it.
     */
    function findAccountRow() {
      if (typeof document === 'undefined' || !document.querySelector) return null;
      return document.querySelector('button[aria-haspopup="menu"][aria-label]')
        || document.querySelector('button[data-signed-out]');
    }

    function findAccountHost() {
      var row = findAccountRow();
      if (row === null) return null;
      var host = row.parentElement;
      return host === null ? null : host;
    }

    /**
     * Mount the button beside the account row. The row is rendered by another
     * plugin, so it may not exist on our first render. Poll until it appears,
     * and keep watching afterwards so a remount (sign-in, theme swap, session
     * switch) does not strand the button.
     */
    function useAccountHost() {
      var state = React.useState(null);
      var host = state[0];
      var setHost = state[1];

      React.useEffect(() => {
        var cancelled = false;
        var timer;

        var look = () => {
          if (cancelled) return;
          var found = findAccountHost();
          if (found !== null) {
            found.classList.add(HOST_CLASS);
            setHost(found);
            return;
          }
          timer = window.setTimeout(look, 200);
        };

        look();

        return () => {
          cancelled = true;
          if (timer !== undefined) window.clearTimeout(timer);
        };
      }, []);

      /* Drop our class when the button goes away. */
      React.useEffect(() => {
        if (host === null) return;
        return () => {
          host.classList.remove(HOST_CLASS);
        };
      }, [host]);

      return host;
    }

    function SettingsButton(props) {
      var host = useAccountHost();
      var onOpen = props.onOpen;

      var button = React.createElement('button', {
        type: 'button',
        className: 'dsb-open-settings',
        onClick: onOpen,
        title: '设置',
        'aria-label': '设置',
        'aria-haspopup': 'dialog',
        'data-dsh-settings-button': ''
      }, React.createElement('span', { className: 'dsb-open-settings__icon' },
        React.createElement('svg', {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        }, [
          React.createElement('circle', { cx: 12, cy: 12, r: 3, key: 'c' }),
          React.createElement('path', {
            key: 'p',
            d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06' +
              'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09' +
              'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06' +
              'a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09' +
              'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06' +
              'a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09' +
              'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06' +
              'a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09' +
              'a1.65 1.65 0 0 0-1.51 1z'
          })
        ])
      ));

      if (host === null) return null;
      return ReactDOM.createPortal(button, host);
    }

    function apply(ctx) {
      // ── stylesheet (package-owned, cleaned up on teardown) ──
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        var existing = document.querySelector('style[data-dsh-settings-button-css]');
        if (existing !== null) return () => {};
        var tag = document.createElement('style');
        tag.dataset.dshSettingsButtonCss = '1';
        tag.textContent = [
          /* Account row becomes a flex line so the gear sits right of the phone number. */
          '.' + HOST_CLASS + '{display:flex;align-items:center;gap:4px;width:100%;min-width:0}',
          '.' + HOST_CLASS + '>button[aria-haspopup="menu"]{flex:1 1 auto;min-width:0}',
          /* Sizes to content so it never steals the row from a full-width sibling. */
          '.dsb-open-settings{flex:0 0 auto;align-items:center;justify-content:center;width:36px;height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;border-radius:50%;gap:0;padding:0;font-family:inherit;display:inline-flex;overflow:hidden;position:relative}',
          '.dsb-open-settings:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
          '.dsb-open-settings:focus-visible{outline:2px solid var(--dsw-alias-state-focus);outline-offset:-2px}',
          '.dsb-open-settings__icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px}'
        ].join('\n');
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'dsh-settings-button: stylesheet');

      // ── mount hook: registered on the footer slot only for its lifecycle ──
      ctx.effect(() => {
        var disposeSlot = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'open-settings',
          // Kept low so this hook registers early; it renders nothing here.
          order: -99,
          label: () => '设置'
        }, () => {
          /**
           * Primary path: run the host's `settings.open` command through the
           * service's private registry. Returns false when unavailable so the
           * caller can fall back.
           */
          var invokeCommand = () => {
            var shortcuts = ctx.shortcuts;
            if (shortcuts === undefined || shortcuts === null) return false;
            var registry = shortcuts.registry;
            if (registry === undefined || registry === null) return false;
            if (typeof registry.invoke !== 'function') return false;
            try {
              registry.invoke('settings.open', { modal: currentModal(), region: 'page' });
              return true;
            } catch (e) {
              return false;
            }
          };

          /**
           * Fallback: drive the account menu's own settings item, which calls
           * the host's `openSettings` on the user's behalf. Only used when the
           * command registry is unreachable.
           */
          var openViaMenu = () => {
            if (typeof document === 'undefined') return;
            if (pickSettingsItem()) return;

            var row = findAccountRow();
            if (row === null) return;

            try {
              row.click();
            } catch (e) {
              return;
            }

            var tries = 0;
            var timer = window.setInterval(() => {
              tries += 1;
              if (pickSettingsItem() || tries >= 30) window.clearInterval(timer);
            }, 50);
          };

          var open = () => {
            if (invokeCommand()) return;
            openViaMenu();
          };

          return React.createElement(SettingsButton, { onOpen: open });
        }));
        return () => disposeSlot();
      }, 'dsh-settings-button: account row action');
    }

    module.exports = { apply: apply, inject: inject };
    return module.exports;
  }
});
