/**
 * @local/dsh-ui Client Module
 *
 * DeepSeek Harness 视觉皮肤与输入栏交互增强
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ui',
  factory(require) {
    const React = require('react');

    // Intercept prefers-reduced-motion to stop AgentPresetSeat intro stagger machine at the root
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        const origMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = function(query) {
          if (typeof query === 'string' && query.includes('prefers-reduced-motion')) {
            return {
              matches: true,
              media: query,
              onchange: null,
              addListener: () => {},
              removeListener: () => {},
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false,
            };
          }
          return origMatchMedia(query);
        };
      } catch (e) {}
    }

    const STYLE_TAG_ID = 'dsh-ui-css';

    const CSS = `
/* ==========================================================================
   Antigravity 1:1 Visual Skin & Hero Layout for DeepSeek Harness
   ========================================================================== */

/* 1. Hero Container & Flex Stacking */
.Dc7zOa_composerHero,
[class*="composerHero"],
[data-conversation-region="composer"] [class*="composerStack"] {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  width: 100% !important;
  max-width: var(--dsh-composer-card-max-width, 1140px) !important;
  margin: 0 auto !important;
  padding: 0 !important;
  gap: 0 !important;
}

/* 2. Top Hero Headline (DeepSeek Logo + 探索未至之境 + 预览版) */
.Hqq-bq_root,
[class*="HeroShell_root"] {
  order: 1 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  margin-bottom: 34px !important;
  padding: 0 !important;
}

.Hqq-bq_headline,
[class*="HeroShell_headline"] {
  font-size: 26px !important;
  font-weight: 500 !important;
  color: #0E1014 !important;
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}

.Hqq-bq_fish,
[class*="HeroShell_fish"] {
  color: #0E1014 !important;
  width: 38px !important;
  height: 28px !important;
}

.Hqq-bq_previewBadge,
[class*="HeroShell_previewBadge"] {
  background: #EEF2FB !important;
  color: #2F54EB !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  padding: 2px 8px !important;
  border-radius: 999px !important;
  border: 0.5px solid rgba(47, 84, 235, 0.18) !important;
  margin-top: 2px !important;
  font-family: inherit !important;
  line-height: 18px !important;
}

/* 3. Composer Input Card (White Box) */
.RlGAzG_root,
[class*="InputBar_root"] {
  order: 2 !important;
  width: 100% !important;
  max-width: var(--dsh-composer-card-max-width, 1140px) !important;
  padding: 0 !important;
  margin: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  position: relative !important;
  z-index: 5 !important;
}

.RlGAzG_card,
[data-composer-card] {
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: var(--dsh-composer-card-max-width, 1140px) !important;
  background: #FFFFFF !important;
  border: 1px solid #E5E7EB !important;
  border-radius: 24px !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03) !important;
  padding: 16px 18px 12px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  position: relative !important;
  z-index: 5 !important;
  transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
}

/* Focus or non-hero standalone card */
:not(.Dc7zOa_composerHero):not([class*="composerHero"]) .RlGAzG_card,
:not(.Dc7zOa_composerHero):not([class*="composerHero"]) [data-composer-card] {
  border-radius: 24px !important;
}

.RlGAzG_card:focus-within,
[data-composer-card]:focus-within {
  border-color: #D1D5DB !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06) !important;
}

/* 4. Textarea & Placeholder */
.RlGAzG_input,
[class*="InputBar_input"] {
  min-height: 48px !important;
  font-size: 15px !important;
  line-height: 24px !important;
  color: #111827 !important;
  caret-color: #2F6FED !important;
  padding: 2px 4px !important;
  outline: none !important;
}

.RlGAzG_placeholder,
[class*="InputBar_placeholder"] {
  font-size: 15px !important;
  line-height: 24px !important;
  color: #9CA3AF !important;
  padding: 2px 4px !important;
}

/* 5. Tool Row Inside Card */
.RlGAzG_row,
[class*="InputBar_row"] {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 4px 0 0 !important;
  margin: 0 !important;
}

.RlGAzG_tools,
[class*="InputBar_tools"] {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

/* '+' Command button */
.RlGAzG_add,
[class*="InputBar_add"] {
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  background: #F4F5F6 !important;
  color: #374151 !important;
  border: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  transition: background-color 0.15s ease !important;
  padding: 0 !important;
}
.RlGAzG_add:hover,
[class*="InputBar_add"]:hover {
  background: #EAEBED !important;
}
.RlGAzG_add svg,
[class*="InputBar_add"] svg {
  width: 14px !important;
  height: 14px !important;
  color: #4B5563 !important;
}

/* Permission selector chip (工作区内修改) */
[class*="preset_trigger"],
[class*="triggerLabel"],
[class*="permission"] button {
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  font-size: 13px !important;
  color: #4B5563 !important;
  font-weight: 400 !important;
  border-radius: 6px !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
  padding: 3px 6px !important;
  line-height: 20px !important;
}
[class*="preset_trigger"]:hover,
[class*="permission"] button:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

/* 6. Trailing Controls (Model selector + Send button) */
.RlGAzG_trailing,
[class*="InputBar_trailing"] {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  margin-left: auto !important;
}

.RlGAzG_standardControls,
[class*="InputBar_standardControls"] {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

/* Model selector trigger */
.msp-trigger,
[class*="modelSelector"] button,
button[aria-label*="模型"],
button[aria-label*="Model"] {
  font-size: 13px !important;
  color: #4B5563 !important;
  height: 28px !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  background: transparent !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 0 6px !important;
  cursor: pointer !important;
}
.msp-trigger:hover,
[class*="modelSelector"] button:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

/* Send / Primary Button (Circle with blue background and white arrow up) */
.RlGAzG_primary,
[class*="InputBar_primary"],
button[aria-label="发送"],
button[aria-label="Send"],
button[aria-label="停止"],
button[aria-label="Stop"] {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  min-height: 34px !important;
  border-radius: 999px !important;
  color: #FFFFFF !important;
  border: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transform: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  transition: background-color 0.15s ease, opacity 0.15s ease, transform 0.1s ease !important;
}

/* 1) Enabled / Active State (when text is entered in input, matches Screenshot 2) */
.RlGAzG_primary:not(:disabled):not([disabled]):not([aria-disabled="true"]),
.RlGAzG_primary[data-has-content="true"],
[class*="InputBar_primary"]:not(:disabled):not([disabled]):not([aria-disabled="true"]),
[class*="InputBar_primary"][data-has-content="true"],
button[aria-label="发送"]:not(:disabled):not([disabled]):not([aria-disabled="true"]),
button[aria-label="发送"][data-has-content="true"],
button[aria-label="Send"]:not(:disabled):not([disabled]):not([aria-disabled="true"]),
button[aria-label="Send"][data-has-content="true"],
button[aria-label="停止"]:not(:disabled):not([disabled]):not([aria-disabled="true"]),
button[aria-label="Stop"]:not(:disabled):not([disabled]):not([aria-disabled="true"]) {
  background: var(--dsw-alias-button-info-fill, #4176E6) !important;
  opacity: 1 !important;
  cursor: pointer !important;
  pointer-events: auto !important;
}

/* 2) Hover State when Enabled */
.RlGAzG_primary:hover:not(:disabled):not([disabled]):not([aria-disabled="true"]),
.RlGAzG_primary[data-has-content="true"]:hover,
[class*="InputBar_primary"]:hover:not(:disabled):not([disabled]):not([aria-disabled="true"]),
[class*="InputBar_primary"][data-has-content="true"]:hover,
button[aria-label="发送"]:hover:not(:disabled):not([disabled]):not([aria-disabled="true"]),
button[aria-label="发送"][data-has-content="true"]:hover,
button[aria-label="Send"]:hover:not(:disabled):not([disabled]):not([aria-disabled="true"]),
button[aria-label="Send"][data-has-content="true"]:hover,
button[aria-label="停止"]:hover:not(:disabled):not([disabled]):not([aria-disabled="true"]),
button[aria-label="Stop"]:hover:not(:disabled):not([disabled]):not([aria-disabled="true"]) {
  background: var(--dsw-alias-button-info-hover, #3464CB) !important;
  opacity: 1 !important;
}

/* 3) Click / Press State when Enabled */
.RlGAzG_primary:active:not(:disabled):not([disabled]):not([aria-disabled="true"]),
[class*="InputBar_primary"]:active:not(:disabled):not([disabled]):not([aria-disabled="true"]) {
  background: #2F5ECD !important;
  transform: scale(0.96) !important;
}

/* 4) Disabled State (when input is empty, matches Screenshot 1: #B2C7F4) */
.RlGAzG_primary:disabled,
.RlGAzG_primary[disabled]:not([data-has-content="true"]),
.RlGAzG_primary[aria-disabled="true"]:not([data-has-content="true"]),
[class*="InputBar_primary"]:disabled,
[class*="InputBar_primary"][disabled]:not([data-has-content="true"]),
[class*="InputBar_primary"][aria-disabled="true"]:not([data-has-content="true"]),
button[aria-label="发送"]:disabled,
button[aria-label="发送"][disabled]:not([data-has-content="true"]),
button[aria-label="发送"][aria-disabled="true"]:not([data-has-content="true"]),
button[aria-label="Send"]:disabled,
button[aria-label="Send"][disabled]:not([data-has-content="true"]),
button[aria-label="Send"][aria-disabled="true"]:not([data-has-content="true"]) {
  background: #B2C7F4 !important;
  opacity: 1 !important;
  cursor: default !important;
  pointer-events: none !important;
}

/* 5) Send Arrow & Stop Icons */
.RlGAzG_primary svg,
[class*="InputBar_primary"] svg {
  width: 16px !important;
  height: 16px !important;
  fill: currentColor !important;
  stroke: none !important;
  display: block !important;
}

.RlGAzG_primary svg path,
[class*="InputBar_primary"] svg path,
.RlGAzG_primary svg rect,
[class*="InputBar_primary"] svg rect {
  fill: #FFFFFF !important;
  stroke: none !important;
}

/* 7. Attached Bottom Bar (影栖坞 | 标准模式 | 技能) */
.Dc7zOa_heroWorkspaceRow,
[class*="heroWorkspaceRow"] {
  order: 3 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  width: calc(100% - 36px) !important;
  max-width: calc(var(--dsh-composer-card-max-width, 1140px) - 36px) !important;
  background: #F3F3F3 !important;
  border-radius: 0 0 16px 16px !important;
  padding: 14px 18px 0 18px !important;
  height: 62px !important;
  min-height: 62px !important;
  box-sizing: border-box !important;
  margin: -14px auto 0 auto !important;
  border-top: none !important;
  border-left: 1px solid #E5E7EB !important;
  border-right: 1px solid #E5E7EB !important;
  border-bottom: 1px solid #E5E7EB !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02) !important;
  z-index: 1 !important;
  position: relative !important;
  transition: none !important;
  animation: none !important;
}

/* Neutralize phantom workspace slot and all its contents completely */
.Dc7zOa_heroWorkspaceRow > [data-slot="conversation.hero.workspace"],
[class*="heroWorkspaceRow"] > [data-slot="conversation.hero.workspace"] {
  display: block !important;
  position: absolute !important;
  width: 0 !important;
  height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  overflow: hidden !important;
  pointer-events: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
}

.Dc7zOa_heroWorkspaceRow [data-slot="conversation.hero.workspace"] *,
[class*="heroWorkspaceRow"] [data-slot="conversation.hero.workspace"] * {
  display: none !important;
}

/* Agent preset slot and menu anchor: inline-flex, zero padding, preserve getBoundingClientRect */
.Dc7zOa_heroWorkspaceRow > [data-slot="conversation.hero.agentPreset"],
[class*="heroWorkspaceRow"] > [data-slot="conversation.hero.agentPreset"],
.Dc7zOa_heroWorkspaceRow [class*="menuAnchor"],
[class*="heroWorkspaceRow"] [class*="menuAnchor"] {
  display: inline-flex !important;
  align-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  min-width: 0 !important;
  width: auto !important;
  height: auto !important;
  flex: none !important;
}

/* Chips inside bottom bar: identical size, padding, margin and font */
.Hqq-bq_workspace,
[class*="HeroShell_workspace"],
._oGoKq_seat,
[class*="AgentPresetSeat_seat"],
.Dc7zOa_heroWorkspaceRow button,
[class*="heroWorkspaceRow"] button,
.dsh-ag-skill-chip {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  color: #374151 !important;
  background: transparent !important;
  border: none !important;
  padding: 4px 6px !important;
  margin: 0 !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  line-height: 20px !important;
  font-family: inherit !important;
  height: 28px !important;
  min-height: 28px !important;
  box-sizing: border-box !important;
  flex: none !important;
  transition: background-color 0.12s ease !important;
}

/* Stability & anchor alignment for the 3 bottom bar items to prevent jitter between different names */
.Hqq-bq_workspace,
[class*="HeroShell_workspace"] {
  width: 88px !important;
  min-width: 88px !important;
  max-width: 88px !important;
  box-sizing: border-box !important;
  justify-content: flex-start !important;
  white-space: nowrap !important;
  overflow: hidden !important;
}

.Hqq-bq_workspaceLabel,
[class*="HeroShell_workspaceLabel"] {
  display: inline-block !important;
  width: 54px !important;
  min-width: 54px !important;
  max-width: 54px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  line-height: 20px !important;
  height: 20px !important;
  vertical-align: middle !important;
  text-align: left !important;
}

._oGoKq_seat,
[class*="AgentPresetSeat_seat"] {
  width: 86px !important;
  min-width: 86px !important;
  max-width: 86px !important;
  box-sizing: border-box !important;
  justify-content: flex-start !important;
  white-space: nowrap !important;
  overflow: hidden !important;
}

._oGoKq_seatLabel,
[class*="AgentPresetSeat_seatLabel"] {
  display: inline-block !important;
  width: 54px !important;
  min-width: 54px !important;
  max-width: 54px !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  white-space: nowrap !important;
  line-height: 20px !important;
  height: 20px !important;
  vertical-align: middle !important;
  text-align: left !important;
}

.dsh-ag-skill-chip {
  width: 60px !important;
  min-width: 60px !important;
  max-width: 60px !important;
  box-sizing: border-box !important;
  justify-content: flex-start !important;
  white-space: nowrap !important;
  overflow: hidden !important;
}

.dsh-ag-skill-chip > span {
  display: inline-block !important;
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  white-space: nowrap !important;
  line-height: 20px !important;
  height: 20px !important;
  vertical-align: middle !important;
  text-align: left !important;
}

/* Optical visual balance spacing between the 3 bottom bar items */
.Dc7zOa_heroWorkspaceRow > button:first-child,
.Dc7zOa_heroWorkspaceRow .Hqq-bq_workspace,
[class*="heroWorkspaceRow"] [class*="HeroShell_workspace"] {
  margin-right: 28px !important;
  margin-left: 0 !important;
}

.Dc7zOa_heroWorkspaceRow [class*="menuAnchor"],
[class*="heroWorkspaceRow"] [class*="menuAnchor"] {
  margin-right: 28px !important;
  margin-left: 0 !important;
}

.dsh-ag-skill-chip {
  margin-right: 0 !important;
  margin-left: 0 !important;
}

.Hqq-bq_workspace:hover,
._oGoKq_seat:hover,
[class*="AgentPresetSeat_seat"]:hover,
.Dc7zOa_heroWorkspaceRow button:hover,
[class*="heroWorkspaceRow"] button:hover,
.dsh-ag-skill-chip:hover {
  background: rgba(0, 0, 0, 0.05) !important;
}

.Dc7zOa_heroWorkspaceRow svg,
[class*="heroWorkspaceRow"] svg {
  color: #4B5563 !important;
  flex-shrink: 0 !important;
}

.dsh-ag-workspace-icon,
.dsh-ag-mode-icon,
.dsh-ag-skill-icon,
.Dc7zOa_heroWorkspaceRow button svg:first-child,
[class*="heroWorkspaceRow"] button svg:first-child,
.Hqq-bq_folder,
[class*="HeroShell_folder"],
._oGoKq_seatIcon,
[class*="AgentPresetSeat_seatIcon"] {
  width: 15px !important;
  height: 13px !important;
  min-width: 15px !important;
  min-height: 13px !important;
  max-width: 15px !important;
  max-height: 13px !important;
  color: #4B5563 !important;
  flex: none !important;
  display: inline-block !important;
  vertical-align: middle !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

/* Disable AgentPresetSeat intro character stagger and icon scaling animations */
._oGoKq_introIcon,
[class*="AgentPresetSeat_introIcon"],
[class*="introIcon"] {
  animation: none !important;
  transition: none !important;
  transform: none !important;
  opacity: 1 !important;
}

._oGoKq_introText,
[class*="AgentPresetSeat_introText"],
[class*="introText"] {
  animation: none !important;
  transition: none !important;
  transform: none !important;
  opacity: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
}

._oGoKq_introChar,
[class*="AgentPresetSeat_introChar"],
[class*="introChar"] {
  animation: none !important;
  transition: none !important;
  transform: none !important;
  opacity: 1 !important;
  display: inline-block !important;
  animation-delay: 0s !important;
}

@keyframes _oGoKq_seat-icon-in {
  0%, 100% { opacity: 1 !important; transform: none !important; }
}

@keyframes _oGoKq_seat-char-in {
  0%, 100% { opacity: 1 !important; transform: none !important; }
}

/* Hide dropdown chevrons in bottom bar while preserving click functionality */
.Dc7zOa_heroWorkspaceRow [class*="chevron"],
[class*="heroWorkspaceRow"] [class*="chevron"],
.Dc7zOa_heroWorkspaceRow .Hqq-bq_chevron,
[class*="heroWorkspaceRow"] .Hqq-bq_chevron,
.Dc7zOa_heroWorkspaceRow ._oGoKq_chevron,
[class*="heroWorkspaceRow"] ._oGoKq_chevron,
.Dc7zOa_heroWorkspaceRow button > svg:last-child:not(:first-child),
[class*="heroWorkspaceRow"] button > svg:last-child:not(:first-child) {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  position: absolute !important;
  pointer-events: none !important;
  visibility: hidden !important;
}

/* 8. Unify Menus (Preset & Skills to match Workspace Menu) */
/* Preset Menu (AgentPresetSeat) refinement to single-line row */
._oGoKq_itemDesc,
[class*="AgentPresetSeat_itemDesc"] {
  display: none !important;
}

._oGoKq_item,
[class*="AgentPresetSeat_item"] {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  width: auto !important;
  max-width: 100% !important;
}

._oGoKq_itemName,
[class*="AgentPresetSeat_itemName"] {
  font-size: 13px !important;
  font-weight: 400 !important;
  color: var(--dsw-alias-label-primary, #111827) !important;
  line-height: 20px !important;
  white-space: nowrap !important;
}

.dsh-ag-mode-menu-icon {
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  min-height: 14px !important;
  color: var(--dsw-alias-label-tertiary, #4B5563) !important;
  flex: none !important;
  justify-content: center !important;
  align-items: center !important;
  display: inline-flex !important;
  margin-right: 6px !important;
}

.dsh-ag-mode-menu-icon svg {
  width: 14px !important;
  height: 14px !important;
}

/* Skills Menu (Matching native Harness _3tUStW Menu) */
.dsh-ag-skills-menu {
  box-sizing: border-box !important;
  background: var(--dsw-specific-menu, rgba(248, 249, 250, 0.94)) !important;
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px)) !important;
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter, blur(20px)) !important;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08)) !important;
  box-shadow: var(--dsw-elevation-prominent, 0 0 0 0.5px rgba(0,0,0,0.08), 0 3px 8px 0 rgba(0,0,0,0.04), 0 0 20px 0 rgba(0,0,0,0.05)) !important;
  z-index: 1100 !important;
  border: 0 !important;
  border-radius: 16px !important;
  flex-direction: column !important;
  gap: 0 !important;
  min-width: 170px !important;
  max-width: 320px !important;
  padding: 3px !important;
  display: flex !important;
  position: fixed !important;
  user-select: none !important;
  animation: dsh-ag-menu-pop-in 0.12s cubic-bezier(0.16, 1, 0.3, 1) !important;
  max-height: calc(100vh - 24px) !important;
  overflow: hidden !important;
}

@keyframes dsh-ag-menu-pop-in {
  from { opacity: 0; transform: scale(0.96) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.dsh-ag-skills-menu ._3tUStW_viewport {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  gap: 0 !important;
  max-height: 280px !important;
  overflow-y: auto !important;
}

.dsh-ag-skills-menu ._3tUStW_itemWrap {
  position: relative !important;
  margin: 0 !important;
  padding: 0 !important;
}

.dsh-ag-skills-menu ._3tUStW_item {
  cursor: pointer !important;
  width: 100% !important;
  min-height: 34px !important;
  color: var(--dsw-alias-label-primary, #111827) !important;
  text-align: left !important;
  background: transparent !important;
  border: none !important;
  border-radius: 8px !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 6px 8px !important;
  font-size: 13px !important;
  line-height: 20px !important;
  display: flex !important;
  box-sizing: border-box !important;
  transition: background-color 0.1s ease !important;
  font-family: inherit !important;
}

.dsh-ag-skills-menu ._3tUStW_item:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05)) !important;
}

.dsh-ag-skills-menu ._3tUStW_itemIcon {
  width: 14px !important;
  height: 14px !important;
  color: var(--dsw-alias-label-tertiary, #4B5563) !important;
  flex: none !important;
  justify-content: center !important;
  align-items: center !important;
  display: inline-flex !important;
}

.dsh-ag-skills-menu ._3tUStW_itemLabel {
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  flex: 1 !important;
  min-width: 0 !important;
  overflow: hidden !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  color: var(--dsw-alias-label-primary, #111827) !important;
}

.dsh-ag-skills-menu ._3tUStW_check {
  width: 14px !important;
  height: 14px !important;
  color: var(--dsw-alias-label-primary, #111827) !important;
  flex: none !important;
  margin-left: auto !important;
}
`;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById(STYLE_TAG_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_TAG_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
      } else if (el.textContent !== CSS) {
        el.textContent = CSS;
      }
    }

    // Known metadata for installed DeepSeek Harness skills
    const KNOWN_SKILL_META = {
      'ai-video-prompt': { name: 'AI视频提示词生成专家', command: 'ai-video-prompt' },
      'storyboard-director': { name: '分镜导演·SD2.0', command: 'storyboard-director' },
      'storyboard-director-sd25': { name: '分镜导演·SD2.5', command: 'storyboard-director-sd25' },
      'screenplay-adaptation': { name: '影视剧本改编大师', command: 'screenplay-adaptation' },
      'art-direction': { name: '艺术指导', command: 'art-direction' },
      'c-drive-cleanup': { name: 'C盘清理', command: 'c-drive-cleanup' },
    };

    // Installed and verified skills in DeepSeek Harness (~/.dsh/skills)
    const INSTALLED_SKILLS = [
      { id: 'ai-video-prompt', name: 'AI视频提示词生成专家', command: 'ai-video-prompt' },
      { id: 'storyboard-director', name: '分镜导演·SD2.0', command: 'storyboard-director' },
      { id: 'storyboard-director-sd25', name: '分镜导演·SD2.5', command: 'storyboard-director-sd25' },
      { id: 'screenplay-adaptation', name: '影视剧本改编大师', command: 'screenplay-adaptation' },
      { id: 'art-direction', name: '艺术指导', command: 'art-direction' },
      { id: 'c-drive-cleanup', name: 'C盘清理', command: 'c-drive-cleanup' },
    ];

    let popoverNode = null;
    let popoverCleanup = null;
    let activeSkillId = 'ai-video-prompt';
    let dshCtx = null;
    let liveSkills = [...INSTALLED_SKILLS];


    async function fetchLiveSkills() {
      if (!dshCtx) return;
      try {
        const sessions = dshCtx.get?.('sessions') || dshCtx.sessions;
        const remoteSkills = dshCtx.get?.('remote.skills') || dshCtx.remote?.skills;
        if (!sessions || !remoteSkills) return;

        const snapshot = sessions.list?.getSnapshot?.();
        const sessionIds = snapshot?.order || [];
        const sessionId = sessionIds[0];
        if (!sessionId) return;

        const res = await remoteSkills.list({ sessionId });
        if (res?.ok && Array.isArray(res.value?.skills)) {
          const list = res.value.skills.map(s => {
            const meta = KNOWN_SKILL_META[s.name];
            return {
              id: s.name,
              name: meta?.name || s.name,
              command: s.name,
              description: s.description || ''
            };
          });
          if (list.length > 0) {
            liveSkills = list;
          }
        }
      } catch (e) {
        // Silently preserve verified installed list
      }
    }

    function closePopover() {
      if (popoverCleanup) {
        popoverCleanup();
        popoverCleanup = null;
      }
      if (popoverNode && popoverNode.parentNode) {
        popoverNode.parentNode.removeChild(popoverNode);
        popoverNode = null;
      }
    }

    function toggleSkillsPopover(anchorEl) {
      if (popoverNode) {
        closePopover();
        return;
      }

      fetchLiveSkills().catch(() => {});

      const rect = anchorEl.getBoundingClientRect();
      const popover = document.createElement('div');
      popover.className = '_3tUStW_list _3tUStW_portal dsh-ag-skills-menu';
      popover.setAttribute('role', 'menu');
      popover.style.position = 'fixed';
      popover.style.top = (rect.bottom + 4) + 'px';

      // Clamp horizontally inside viewport
      const MARGIN = 12;
      const initialLeft = rect.left;
      popover.style.left = Math.max(MARGIN, initialLeft) + 'px';

      const skillsToRender = (liveSkills && liveSkills.length > 0) ? liveSkills : INSTALLED_SKILLS;

      popover.innerHTML = `
        <div class="_3tUStW_viewport" role="presentation">
          ${skillsToRender.map(s => {
            const isSelected = (s.id === activeSkillId || s.command === activeSkillId);
            return `
              <div class="_3tUStW_itemWrap">
                <button type="button" role="menuitem" class="_3tUStW_item ${isSelected ? '_3tUStW_selected' : ''}" data-skill-id="${s.id}" data-skill-command="${s.command || s.id}" data-skill-name="${s.name}">
                  <span class="_3tUStW_itemIcon">
                    <svg width="14" height="14" viewBox="0 0 176 150" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--dsw-alias-label-tertiary,#4B5563);flex:none;" aria-hidden="true">
                      <path d="M108 4L30 40V126L72 147L150 111V25L108 4Z" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                      <path d="M72 61V147" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
                      <path d="M30 40L72 61L150 25" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                      <path d="M30 83L72 104L150 68" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                    </svg>
                  </span>
                  <span class="_3tUStW_itemLabel">${s.name}</span>
                  ${isSelected ? `
                    <svg class="_3tUStW_check" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  ` : ''}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;

      popover.querySelectorAll('button[data-skill-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const skillId = btn.dataset.skillId;
          const command = btn.dataset.skillCommand || skillId;
          activeSkillId = skillId;
          closePopover();
          // Find composer input and focus/insert native Harness skill trigger
          const editor = document.querySelector('.RlGAzG_input, [class*="InputBar_input"], [data-composer-input], textarea, div[contenteditable="true"]');
          if (editor) {
            editor.focus();
            const textToInsert = `/${command} `;
            if (document.execCommand) {
              document.execCommand('insertText', false, textToInsert);
            } else if (editor.value !== undefined) {
              editor.value = textToInsert;
            }
            editor.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      });

      document.body.appendChild(popover);
      popoverNode = popover;

      // Adjust left if overflow
      const actualWidth = popover.offsetWidth || 200;
      if (rect.left + actualWidth > window.innerWidth - MARGIN) {
        popover.style.left = Math.max(MARGIN, window.innerWidth - MARGIN - actualWidth) + 'px';
      }

      const onOutside = (e) => {
        if (popover && !popover.contains(e.target) && !anchorEl.contains(e.target)) {
          closePopover();
        }
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          closePopover();
        }
      };
      const onResizeOrScroll = () => {
        closePopover();
      };

      popoverCleanup = () => {
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', onResizeOrScroll);
        window.removeEventListener('scroll', onResizeOrScroll, true);
      };

      setTimeout(() => {
        if (!popoverNode) return;
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onResizeOrScroll);
        window.addEventListener('scroll', onResizeOrScroll, true);
      }, 10);
    }

    // Custom skill cube icon geometry extracted 1:1 from media_1790823474989.png
    const SKILL_SVG_HTML = `
      <svg width="15" height="13" viewBox="0 0 176 150" fill="none" xmlns="http://www.w3.org/2000/svg" class="dsh-ag-skill-icon" style="flex:none;margin:0;display:inline-block;vertical-align:middle;color:currentColor;" aria-hidden="true">
        <path d="M108 4L30 40V126L72 147L150 111V25L108 4Z" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
        <path d="M72 61V147" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M30 40L72 61L150 25" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
        <path d="M30 83L72 104L150 68" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
      </svg>
    `;

    // Attach skill chip to heroWorkspaceRow whenever mounted
    function attachSkillChip(row) {
      if (!row) return;
      let chip = row.querySelector('.dsh-ag-skill-chip');
      if (!chip) {
        chip = document.createElement('button');
        chip.className = 'dsh-ag-skill-chip';
        chip.type = 'button';
        chip.setAttribute('aria-label', '技能');
        chip.innerHTML = `${SKILL_SVG_HTML}<span>技能</span>`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleSkillsPopover(chip);
        });
        row.appendChild(chip);
      } else {
        const existingSvg = chip.querySelector('svg');
        if (existingSvg && existingSvg.getAttribute('viewBox') !== '0 0 176 150') {
          existingSvg.outerHTML = SKILL_SVG_HTML;
        }
      }
    }

    // Custom workspace icon geometry extracted 1:1 from media_1790822141172.png
    const WORKSPACE_SVG_PATHS = `
      <path d="M4 24C4 13 13 4 24 4H64C76 4 86 16 94 27C98 32 103 35 110 35H152C163 35 172 44 172 55V126C172 137 163 146 152 146H24C13 146 4 137 4 126V24Z" stroke="currentColor" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M4 70H172" stroke="currentColor" stroke-width="8.5" fill="none"/>
    `;

    function updateWorkspaceSvgNode(svgNode) {
      if (!svgNode) return;
      if (svgNode.dataset.dshAgReplaced === 'true' && svgNode.getAttribute('viewBox') === '0 0 176 150') return;
      svgNode.dataset.dshAgReplaced = 'true';
      svgNode.setAttribute('viewBox', '0 0 176 150');
      svgNode.setAttribute('width', '15');
      svgNode.setAttribute('height', '13');
      svgNode.classList.add('dsh-ag-workspace-icon');
      svgNode.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;max-width:15px;max-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;box-sizing:border-box;';
      svgNode.innerHTML = WORKSPACE_SVG_PATHS;
    }

    function createWorkspaceSvgNode() {
      const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newSvg.setAttribute('viewBox', '0 0 176 150');
      newSvg.setAttribute('width', '15');
      newSvg.setAttribute('height', '13');
      newSvg.classList.add('Hqq-bq_folder', 'dsh-ag-workspace-icon');
      newSvg.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;';
      newSvg.innerHTML = WORKSPACE_SVG_PATHS;
      return newSvg;
    }

    function sanitizeWorkspaceLabel(row) {
      if (!row) return;
      const wsBtn = row.querySelector('.Hqq-bq_workspace, [class*="HeroShell_workspace"], [class*="workspaceTrigger"], button[class*="workspace"]');
      if (!wsBtn) return;
      const label = wsBtn.querySelector('.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]');
      if (label) {
        const text = label.textContent?.trim();
        if (!text || text === '选择工作区' || text === '默认' || text === 'Default') {
          if (label.textContent !== '选择项目') {
            label.textContent = '选择项目';
          }
        }
      }
    }

    function replaceWorkspaceFolderIcon(row) {
      if (!row) return;
      let wsBtn = row.querySelector('.Hqq-bq_workspace, [class*="HeroShell_workspace"], [class*="workspaceTrigger"], [class*="workspace"]');
      if (!wsBtn) {
        const firstBtn = row.querySelector('button:not(.dsh-ag-skill-chip)');
        if (firstBtn && !firstBtn.classList.contains('dsh-ag-skill-chip')) {
          wsBtn = firstBtn;
        }
      }
      if (!wsBtn) return;

      const folderSvg = wsBtn.querySelector('.Hqq-bq_folder, [class*="HeroShell_folder"], [class*="folder"], svg:not([class*="chevron"]):not(.dsh-ag-workspace-icon)');
      if (folderSvg) {
        updateWorkspaceSvgNode(folderSvg);
      } else if (!wsBtn.querySelector('.dsh-ag-workspace-icon')) {
        const newSvg = createWorkspaceSvgNode();
        const label = wsBtn.querySelector('.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]');
        if (label) {
          wsBtn.insertBefore(newSvg, label);
        } else {
          wsBtn.prepend(newSvg);
        }
      }
    }

    function replaceAllWorkspaceIcons(root = document) {
      const wsButtons = root.querySelectorAll('.Hqq-bq_workspace, [class*="HeroShell_workspace"], [class*="workspaceTrigger"], button[class*="workspace"]');
      wsButtons.forEach(wsBtn => {
        const label = wsBtn.querySelector('.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]');
        if (label) {
          const text = label.textContent?.trim();
          if (!text || text === '选择工作区' || text === '默认' || text === 'Default') {
            if (label.textContent !== '选择项目') {
              label.textContent = '选择项目';
            }
          }
        }
        const folderSvg = wsBtn.querySelector('.Hqq-bq_folder, [class*="HeroShell_folder"], [class*="folder"], svg:not([class*="chevron"]):not(.dsh-ag-workspace-icon)');
        if (folderSvg) {
          updateWorkspaceSvgNode(folderSvg);
        } else if (!wsBtn.querySelector('.dsh-ag-workspace-icon')) {
          const newSvg = createWorkspaceSvgNode();
          if (label) {
            wsBtn.insertBefore(newSvg, label);
          } else {
            wsBtn.prepend(newSvg);
          }
        }
      });
    }

    // Custom standard mode icon geometry extracted 1:1 from media_1790823474988.png
    const MODE_SVG_PATHS = `
      <circle cx="85" cy="28.5" r="25.5" stroke="currentColor" stroke-width="8.5" fill="none"/>
      <circle cx="43.5" cy="120" r="25.5" stroke="currentColor" stroke-width="8.5" fill="none"/>
      <circle cx="126.5" cy="120" r="25.5" stroke="currentColor" stroke-width="8.5" fill="none"/>
      <path d="M118 39A57.5 57.5 0 0 1 142.5 86.5" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
      <path d="M109 138.5A57.5 57.5 0 0 1 71 142.5" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
      <path d="M28 91.5A57.5 57.5 0 0 1 47 43.7" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
    `;

    function updateModeSvgNode(svgNode) {
      if (!svgNode) return;
      if (svgNode.dataset.dshAgReplaced === 'true' && svgNode.getAttribute('viewBox') === '0 0 176 150') return;
      svgNode.dataset.dshAgReplaced = 'true';
      svgNode.setAttribute('viewBox', '0 0 176 150');
      svgNode.setAttribute('width', '15');
      svgNode.setAttribute('height', '13');
      svgNode.classList.add('dsh-ag-mode-icon');
      svgNode.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;max-width:15px;max-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;box-sizing:border-box;';
      svgNode.innerHTML = MODE_SVG_PATHS;
    }

    function createModeSvgNode() {
      const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newSvg.setAttribute('viewBox', '0 0 176 150');
      newSvg.setAttribute('width', '15');
      newSvg.setAttribute('height', '13');
      newSvg.classList.add('_oGoKq_seatIcon', 'dsh-ag-mode-icon');
      newSvg.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;';
      newSvg.innerHTML = MODE_SVG_PATHS;
      return newSvg;
    }

    function replaceModeIcon(row) {
      if (!row) return;
      let modeBtn = row.querySelector('._oGoKq_seat, [class*="AgentPresetSeat_seat"], [class*="seat"]');
      if (!modeBtn) {
        const buttons = Array.from(row.querySelectorAll('button:not(.dsh-ag-skill-chip)'));
        if (buttons.length >= 2) {
          modeBtn = buttons[1];
        }
      }
      if (!modeBtn) return;

      if (!modeBtn.dataset.dshAgHooked) {
        modeBtn.dataset.dshAgHooked = 'true';
        modeBtn.addEventListener('click', () => {
          requestAnimationFrame(() => enhancePresetMenuItems());
          setTimeout(enhancePresetMenuItems, 10);
          setTimeout(enhancePresetMenuItems, 50);
        });
      }

      const modeSvg = modeBtn.querySelector('._oGoKq_seatIcon, [class*="seatIcon"], svg:not([class*="chevron"]):not(.dsh-ag-mode-icon)');
      if (modeSvg) {
        updateModeSvgNode(modeSvg);
      } else if (!modeBtn.querySelector('.dsh-ag-mode-icon')) {
        const newSvg = createModeSvgNode();
        const label = modeBtn.querySelector('._oGoKq_seatLabel, [class*="seatLabel"], span');
        if (label) {
          modeBtn.insertBefore(newSvg, label);
        } else {
          modeBtn.prepend(newSvg);
        }
      }
    }

    function replaceAllModeIcons(root = document) {
      const modeButtons = root.querySelectorAll('._oGoKq_seat, [class*="AgentPresetSeat_seat"], button[class*="seat"]');
      modeButtons.forEach(modeBtn => {
        if (!modeBtn.dataset.dshAgHooked) {
          modeBtn.dataset.dshAgHooked = 'true';
          modeBtn.addEventListener('click', () => {
            requestAnimationFrame(() => enhancePresetMenuItems());
            setTimeout(enhancePresetMenuItems, 10);
            setTimeout(enhancePresetMenuItems, 50);
          });
        }

        const modeSvg = modeBtn.querySelector('._oGoKq_seatIcon, [class*="seatIcon"], svg:not([class*="chevron"]):not(.dsh-ag-mode-icon)');
        if (modeSvg) {
          updateModeSvgNode(modeSvg);
        } else if (!modeBtn.querySelector('.dsh-ag-mode-icon')) {
          const newSvg = createModeSvgNode();
          const label = modeBtn.querySelector('._oGoKq_seatLabel, [class*="seatLabel"], span');
          if (label) {
            modeBtn.insertBefore(newSvg, label);
          } else {
            modeBtn.prepend(newSvg);
          }
        }
      });
    }

    function enhancePresetMenuItems() {
      const presetLabels = document.querySelectorAll('._oGoKq_item, [class*="AgentPresetSeat_item"]');
      presetLabels.forEach(presetSpan => {
        const btn = presetSpan.closest('button._3tUStW_item, button[class*="Menu_item"], button[role="menuitem"]');
        if (btn && !btn.querySelector('.dsh-ag-mode-menu-icon')) {
          const iconSpan = document.createElement('span');
          iconSpan.className = '_3tUStW_itemIcon dsh-ag-mode-menu-icon';
          iconSpan.setAttribute('aria-hidden', 'true');
          iconSpan.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 176 150" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--dsw-alias-label-tertiary,#4B5563);flex:none;">
              <circle cx="85" cy="28.5" r="25.5" stroke="currentColor" stroke-width="9" fill="none"/>
              <circle cx="43.5" cy="120" r="25.5" stroke="currentColor" stroke-width="9" fill="none"/>
              <circle cx="126.5" cy="120" r="25.5" stroke="currentColor" stroke-width="9" fill="none"/>
              <path d="M118 39A57.5 57.5 0 0 1 142.5 86.5" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
              <path d="M109 138.5A57.5 57.5 0 0 1 71 142.5" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
              <path d="M28 91.5A57.5 57.5 0 0 1 47 43.7" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
            </svg>
          `;
          btn.insertBefore(iconSpan, btn.firstChild);
        }
      });
    }

    function hideHeroChevrons(row) {
      if (!row) return;
      const chevrons = row.querySelectorAll('[class*="chevron"], button > svg:last-child:not(:first-child)');
      chevrons.forEach(el => {
        if (el && el.style.display !== 'none') {
          el.style.display = 'none';
        }
      });
    }

    function fixHeroRowGaps(row) {
      if (!row) return;
      const wsSlot = row.querySelector(':scope > [data-slot="conversation.hero.workspace"], [data-slot="conversation.hero.workspace"]');
      if (wsSlot && wsSlot.style.position !== 'absolute') {
        wsSlot.style.setProperty('display', 'block', 'important');
        wsSlot.style.setProperty('position', 'absolute', 'important');
        wsSlot.style.setProperty('width', '0', 'important');
        wsSlot.style.setProperty('height', '0', 'important');
        wsSlot.style.setProperty('overflow', 'hidden', 'important');
        wsSlot.style.setProperty('pointer-events', 'none', 'important');
        wsSlot.style.setProperty('margin', '0', 'important');
        wsSlot.style.setProperty('padding', '0', 'important');
        Array.from(wsSlot.children).forEach(child => {
          child.style.setProperty('display', 'none', 'important');
        });
      }
    }

    function syncSendButtonState() {
      const cards = document.querySelectorAll('.RlGAzG_card, [class*="InputBar_card"]');
      cards.forEach(card => {
        const editor = card.querySelector('.RlGAzG_input, [class*="InputBar_input"], [data-composer-input], textarea, [contenteditable="true"]');
        const sendBtn = card.querySelector('.RlGAzG_primary, [class*="InputBar_primary"], button[aria-label="发送"], button[aria-label="Send"]');
        if (!sendBtn) return;
        if (editor) {
          const text = (editor.innerText || editor.textContent || '').trim();
          const hasContent = text.length > 0;
          const current = sendBtn.getAttribute('data-has-content') === 'true';
          if (hasContent !== current) {
            if (hasContent) {
              sendBtn.setAttribute('data-has-content', 'true');
            } else {
              sendBtn.removeAttribute('data-has-content');
            }
          }
        }
      });
    }

    function scanAndEnhance() {
      ensureStyles();
      syncSendButtonState();
      const rows = document.querySelectorAll('.Dc7zOa_heroWorkspaceRow, [class*="heroWorkspaceRow"]');
      rows.forEach(row => {
        fixHeroRowGaps(row);
        sanitizeWorkspaceLabel(row);
        attachSkillChip(row);
        replaceWorkspaceFolderIcon(row);
        replaceModeIcon(row);
        hideHeroChevrons(row);
      });
      replaceAllWorkspaceIcons(document);
      replaceAllModeIcons(document);
      enhancePresetMenuItems();
    }

    let scanTimer = null;
    function scheduleScan() {
      if (scanTimer) return;
      scanTimer = requestAnimationFrame(() => {
        scanTimer = null;
        try {
          scanAndEnhance();
        } catch (e) {}
      });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        dshCtx = ctx;
        ensureStyles();

        // Warm live skills catalog
        fetchLiveSkills().catch(() => {});

        // Attach dynamic reactive input listeners for send button
        if (typeof document !== 'undefined') {
          document.addEventListener('input', syncSendButtonState, true);
          document.addEventListener('compositionend', syncSendButtonState, true);
          document.addEventListener('keyup', syncSendButtonState, true);
          document.addEventListener('paste', syncSendButtonState, true);
        }

        // Run initial scan
        scheduleScan();

        // Observe DOM for workspace row updates (e.g. navigation, new sessions)
        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
          const obs = new MutationObserver(() => {
            scheduleScan();
          });
          obs.observe(document.body, { childList: true, subtree: true });

          ctx.on?.('dispose', () => {
            if (scanTimer) cancelAnimationFrame(scanTimer);
            obs.disconnect();
            closePopover();
            const el = document.getElementById(STYLE_TAG_ID);
            if (el) el.remove();
          });
        }
      }
    };
  }
});
