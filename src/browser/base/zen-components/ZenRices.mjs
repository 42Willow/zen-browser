
{
  const ZEN_RICE_API = Services.prefs.getStringPref("zen.rice.api.url", '');

  class ZenRiceCollector {
    constructor() {}

    clear() {
      this._userChrome = null;
      this._userContent = null;
      this._enabledMods = null;
      this._preferences = null;
      this._workspaceThemes = null;
    }

    async gatherAll({
        userUserChrome = true, userContent = true,
        enabledMods = true, preferences = true,
        modPrefs = true, workspaceThemes = true } = {}) {
      this.clear();
      // Get the mods first, as they may be needed for the preferences
      if (enabledMods) {
        await this.gatherEnabledMods();
      }
      await Promise.all([
        userUserChrome && this.gatherUserChrome(),
        userContent && this.gatherUserContent(),
        preferences && this.gatherPreferences({ modPrefs }),
        workspaceThemes && this.gatherWorkspaceThemes(),
      ]);
    }

    get profileDir() {
      return PathUtils.profileDir;
    }

    async gatherUserChrome() {
      try {
        const path = PathUtils.join(this.profileDir, 'chrome', 'userChrome.css');
        this._userChrome = await IOUtils.readUTF8(path);
      } catch (e) {
        console.warn("[ZenRiceCollector]: Error reading userChrome.css: ", e);
        return null;
      }
    }

    async gatherUserContent() {
      try {
        const path = PathUtils.join(this.profileDir, 'chrome', 'userContent.css');
        this._userContent = await IOUtils.readUTF8(path);
      } catch (e) {
        console.warn("[ZenRiceCollector]: Error reading userContent.css: ", e);
        return null;
      }
    }

    async gatherEnabledMods() {
      const activeThemes = await gZenThemesImporter.getEnabledThemes();
      if (activeThemes.length === 0) {
        return;
      }
      this._enabledMods = activeThemes;
    }

    _getThemePrefValue(theme, pref) {
      if (pref.type === 'checkbox') {
        return Services.prefs.getBoolPref(pref.property);
      }
      return Services.prefs.getStringPref(pref.property);
    }

    async gatherPreferences({ modPrefs = true } = {}) {
      this._preferences = {};
      if (modPrefs && this._enabledMods) {
        for (const theme of this._enabledMods) {
          const prefs = await ZenThemesCommon.getThemePreferences(theme);
          for (const pref of prefs) {
            this._preferences[pref.property] = this._getThemePrefValue(theme, pref);
          }
        }
      }
      const boolPrefsToCollect = [
        'zen.view.use-single-toolbar',
        'zen.view.sidebar-expanded',
        'zen.tabs.vertical.right-side',
        'zen.view.experimental-no-window-controls',
        'zen.view.hide-window-controls',
        ...(gZenOperatingSystemCommonUtils.currentOperatingSystem === "windows"
          ? ['widget.windows.mica']
          : []
        ),
      ];
      const stringPrefsToCollect = [
        'browser.uiCustomization.state'
      ];
      for (const pref of boolPrefsToCollect) {
        this._preferences[pref] = Services.prefs.getBoolPref(pref);
      }
      for (const pref of stringPrefsToCollect) {
        this._preferences[pref] = Services.prefs.getStringPref(pref);
      }
    }

    async gatherWorkspaceThemes() {
      const workspaces = (await ZenWorkspaces._workspaces()).workspaces;
      this._workspaceThemes = workspaces.map(w => w.theme);
    }

    async packRice(...args) {
      await this.gatherAll(...args);
      const rice = {
        userChrome: this._userChrome,
        userContent: this._userContent,
        enabledMods: this._enabledMods?.map(t => t.id),
        preferences: this._preferences,
        workspaceThemes: this._workspaceThemes,
      };
      return rice;
    }
  }

  class ZenRiceManager {
    constructor() {
      this._collector = new ZenRiceCollector();
    }

    init() {
    }

    async packRice() {
      return this._collector.packRice();
    }

    get shareDialog() {
      if (this._shareDialog) {
        return this._shareDialog;
      }
      this._shareDialog = window.MozXULElement.parseXULToFragment(`
        <vbox id="zen-rice-share-dialog-overlay" hidden="true">
          <vbox id="zen-rice-share-dialog">
            <html:img src="chrome://browser/content/zen-images/brand-header.svg" class="zen-rice-share-header" />
            <hbox class="zen-rice-share-content">
              <vbox id="zen-rice-share-first-form">
                <html:input type="text" data-l10n-id="zen-rice-share-name" id="zen-rice-share-name" oninput="gZenThemePicker.riceManager.validateShareDialog(this)" />
                <hbox class="zen-rice-share-author">
                  <label data-l10n-id="zen-rice-share-author" />
                  <html:input type="text" data-l10n-id="zen-rice-share-author-input" id="zen-rice-share-author" />
                </hbox>
                <vbox zen-collapsed="true" id="zen-rice-share-options" onclick="gZenThemePicker.riceManager.toggleOptions(event)">
                  <hbox class="options-header">
                    <label data-l10n-id="zen-rice-share-include" />
                    <image></image>
                  </hbox>
                  <checkbox data-l10n-id="zen-rice-share-include-userchrome" id="zen-rice-share-include-userchrome" />
                  <checkbox data-l10n-id="zen-rice-share-include-usercontent" id="zen-rice-share-include-usercontent" />
                  <checkbox data-l10n-id="zen-rice-share-include-mods" id="zen-rice-share-include-mods" />
                  <vbox class="indent">
                    <checkbox data-l10n-id="zen-rice-share-include-mod-prefs" id="zen-rice-share-include-mod-prefs" />
                  </vbox>
                  <checkbox data-l10n-id="zen-rice-share-include-preferences" id="zen-rice-share-include-preferences" />
                  <checkbox data-l10n-id="zen-rice-share-include-workspace-themes" id="zen-rice-share-include-workspace-themes" />
                </vbox>
                <html:moz-button-group class="panel-footer">
                  <button onclick="gZenThemePicker.riceManager.cancel()" class="footer-button" data-l10n-id="zen-rice-share-cancel" />
                  <button onclick="gZenThemePicker.riceManager.submit()" class="footer-button" data-l10n-id="zen-rice-share-save" default="true" slot="primary" id="zen-rice-share-save" disabled="true" />
                </html:moz-button-group>
              </vbox>
              <vbox id="zen-rice-share-second-form" hidden="true">
                <hbox></hbox>
                <vbox id="zen-rice-share-error" hidden="true">
                  <label data-l10n-id="zen-rice-share-error" />
                  <button onclick="gZenThemePicker.riceManager.resetShareDialog()" data-l10n-id="zen-close-label" class="footer-button" />
                </vbox>
              </vbox>
              <vbox id="zen-rice-share-success" hidden="true">
                <h1 data-l10n-id="zen-rice-share-success" />
                <label data-l10n-id="zen-rice-share-success-link" />
                <html:input type="text" readonly="true" id="zen-rice-share-success-link" onclick="this.select()" />
                <html:moz-button-group class="panel-footer">
                  <button onclick="gZenThemePicker.riceManager.resetShareDialog()" data-l10n-id="zen-close-label" class="footer-button" slot="primary" default="true" />
                </html:moz-button-group>
              </vbox>
            </hbox>
          </vbox>
        </vbox>
      `);
      document.getElementById("zen-main-app-wrapper").appendChild(this._shareDialog);
      this._shareDialog = document.getElementById("zen-rice-share-dialog-overlay");
      return this._shareDialog;
    }

    toggleOptions(event) {
      if (event.originalTarget.closest(".options-header")) {
        const options = document.getElementById("zen-rice-share-options");
        options.setAttribute("zen-collapsed", options.getAttribute("zen-collapsed") === "true" ? "false" : "true");
      }
      this.validateShareDialog(document.getElementById("zen-rice-share-name"));
    }

    openShareDialog() {
      window.docShell.treeOwner
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIAppWindow)
        .rollupAllPopups();

      const dialog = this.shareDialog;
      dialog.removeAttribute("hidden");

      // Initialize the dialog with the current values
      this.validateShareDialog(document.getElementById("zen-rice-share-name"));
    }

    resetShareDialog() {
      const dialog = this.shareDialog;
      dialog.setAttribute("hidden", "true");
      document.getElementById("zen-rice-share-name").value = "";
      document.getElementById("zen-rice-share-author").value = "";
      document.getElementById("zen-rice-share-save").disabled = true;
    }

    cancel() {
      this.resetShareDialog();
    }

    getAllowedRice() {
      return {
        userChrome: document.getElementById("zen-rice-share-include-userchrome").checked,
        userContent: document.getElementById("zen-rice-share-include-usercontent").checked,
        mods: document.getElementById("zen-rice-share-include-mods").checked,
        modPrefs: document.getElementById("zen-rice-share-include-mod-prefs").checked,
        preferences: document.getElementById("zen-rice-share-include-preferences").checked,
        workspaceThemes: document.getElementById("zen-rice-share-include-workspace-themes").checked,
      };
    }

    get userAgent() {
      return `ZenBrowser/${Services.appinfo.version} (${gZenOperatingSystemCommonUtils.currentOperatingSystem})`;
    }

    canShareRice() {
      const allowedRice = this.getAllowedRice();
      const modsPrefs = document.getElementById("zen-rice-share-include-mod-prefs");
      // remove "share mod prefs" if mods are not included
      if (!allowedRice.mods) {
        allowedRice.modPrefs = false;
        modsPrefs.disabled = true;
      }
      modsPrefs.disabled = !allowedRice.mods;
      return Object.values(allowedRice).some(v => v);
    }

    validateShareDialog(input) {
      const saveButton = document.getElementById("zen-rice-share-save");
      saveButton.disabled = !this.canShareRice() || input.value.trim().length < 3 || input.value.trim().length > 30;
    }

    async submit() {
      const firstForm = document.getElementById("zen-rice-share-first-form");
      const secondForm = document.getElementById("zen-rice-share-second-form");
      firstForm.setAttribute("fade-out", "true");
      secondForm.removeAttribute("hidden");
      await this._submit();
    }

    async _submit() {
      const allowedRice = this.getAllowedRice();
      const rice = await this._collector.packRice(allowedRice);
      const name = document.getElementById("zen-rice-share-name").value;
      const author = document.getElementById("zen-rice-share-author").value;
      const response = await this._sendRice({ name, author, rice });
      if (response) {
        this.showSuccessDialog(response);
      }
    }

    async _sendRice({ name, author, rice }) {
      // Encode the rice as base64 and send it as request body, change user agent to "ZenBrowser" and send author info in the headers
      const base64 = btoa(JSON.stringify(rice));
      const headers = new Headers();
      headers.append("X-Zen-Rice-Name", name);
      headers.append("X-Zen-Rice-Author", author);
      headers.append("User-Agent", this.userAgent);
      let response;
      try {
        response = await fetch(`${ZEN_RICE_API}/rices`, {
          method: "POST",
          headers,
          body: base64,
        });
      } catch (e) {
        this.showErrorMessage("An error occurred while sharing your rice. Please try again later.");
        console.error(e);
        return null;
      }
      // Here, response will never be a null object
      return await this._verifyResponse(response);
    }

    async _verifyResponse(response) {
      const json = await response.json();
      if (!response.ok) {
        const message = json.message || "An error occurred while sharing your rice.";
        this.showErrorMessage(message);
        console.error(json);
        return null;
      }

      return json;
    }

    showErrorMessage(message) {
      const errorBox = document.getElementById("zen-rice-share-error");
      errorBox.removeAttribute("hidden");
      errorBox.querySelector("label").textContent = message;
    }

    showSuccessDialog(riceInfo) {
      const { id } = riceInfo;
      setTimeout(() => {
        const successBox = document.getElementById("zen-rice-share-success");
        document.getElementById("zen-rice-share-second-form").setAttribute("fade-out", "true");
        successBox.removeAttribute("hidden");
        const link = document.getElementById("zen-rice-share-success-link");
        link.value = `${ZEN_RICE_API}${id}`;
      }, 2000);
    }
  }

  window.ZenRiceManager = ZenRiceManager;
}