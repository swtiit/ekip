/**
 * The hub's web app — one page, three views (Chat, Board, Settings) behind a
 * shared nav, served at `/chat`, `/board` and `/settings`.
 *
 * Dependency-free on purpose: no build step, no framework. One `/api/state`
 * fetch feeds every view, an `/api/events` SSE stream triggers re-renders,
 * and navigation is History API with a tiny router.
 *
 * Styles and client script live in ./web as String.raw templates, so escapes
 * reach the browser exactly as written. This file is only the markup shell;
 * user-facing words carry data-t keys the client translates (English or
 * Vietnamese, following the hub's reporting language).
 *
 * Layout, from what agent tools that work well have in common:
 * - Chat is for talking; a live Crew panel beside it tracks who is doing what
 *   (a chat thread is a poor workflow tracker), with Stop on every run.
 * - Each agent has one identity — hue, monogram, adapter mark — everywhere.
 * - Tool calls are plain-language steps grouped per stretch of work: open
 *   while the agent works, folded once it is done, the current step lit.
 * - Delegated work nests under the hand-off that created it; results come
 *   with receipts (files, logs) and what the run cost.
 * - Board is a kanban by state; Settings saves itself; ⌘K goes anywhere.
 */
import { CLIENT } from "./web/client.js";
import { STYLES } from "./web/styles.js";
import { guideHtml } from "./web/guide.js";

export function appHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>ekip</title>
<style>${STYLES}</style>
</head>
<body>
<header class="bar">
  <div class="brand"><span class="logo">ek</span><b>ekip</b><span class="sep">/</span><span class="proj" id="proj"></span></div>
  <nav class="tabs">
    <a href="/chat" data-view="chat"><svg class="ico sm" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span data-t="chat">Chat</span></a>
    <a href="/board" data-view="board"><svg class="ico sm" viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg><span data-t="board">Board</span><span class="count" id="board-count"></span></a>
    <a href="/guide" data-view="guide"><svg class="ico sm" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/></svg><span data-t="guide">Guide</span></a>
    <a href="/settings" data-view="settings"><svg class="ico sm" viewBox="0 0 24 24"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg><span data-t="settings">Settings</span></a>
  </nav>
  <div class="right">
    <span class="live-chip" id="live-chip"><span class="lamp"></span><span id="live-text"></span></span>
    <button class="cmdk" id="open-palette"><svg class="ico sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span data-t="search">Search</span><kbd>⌘K</kbd></button>
    <button class="btn ghost icon" id="theme" data-tt="theme" title="Theme"></button>
  </div>
</header>

<main>
  <!-- ============ CHAT ============ -->
  <section class="view" id="v-chat">
    <div class="chat" id="chat-grid">
      <aside class="side">
        <div class="hd">
          <button class="btn primary" id="new-chat"><svg class="ico sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span data-t="newChat">New conversation</span></button>
          <label class="search"><svg class="ico sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="field" id="filter" data-tp="filter" placeholder="Filter"></label>
        </div>
        <div class="list" id="threads"></div>
      </aside>

      <section class="stage">
        <div class="stage-top" id="stage-top"></div>
        <div class="scroller" id="scroller"><div class="transcript" id="transcript"></div></div>
        <button class="btn quiet sm jump" id="jump" hidden><svg class="ico sm" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg><span data-t="jump">Jump to latest</span></button>
        <div class="dock">
          <div class="composer">
            <textarea id="text" rows="1" data-tp="ph" placeholder="Ask the crew…"></textarea>
            <div class="row">
              <button class="target folder-chip" id="folder" aria-haspopup="listbox"></button>
              <button class="target" id="target" aria-haspopup="listbox"></button>
              <span class="hint" id="dock-hint"></span>
              <span class="sp"></span>
              <button class="send" id="send" aria-label="Send" disabled><svg class="ico" viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
            </div>
            <div class="popover" id="agent-pop" hidden></div>
            <div class="popover folder-pop" id="folder-pop" hidden></div>
          </div>
        </div>
      </section>

      <aside class="crew">
        <div class="hd"><svg class="ico sm" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.5"/></svg><b data-t="crew">Crew</b><span class="sub" id="crew-sub"></span></div>
        <div class="members" id="members"></div>
        <div class="foot" id="crew-foot"></div>
      </aside>
    </div>
  </section>

  <!-- ============ BOARD ============ -->
  <section class="view" id="v-board">
    <div class="board">
      <div class="board-top">
        <label class="search"><svg class="ico sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="field" id="board-search" data-tp="filter" placeholder="Filter"></label>
        <select class="field folder-filter" id="board-folder"></select>
        <div class="filters" id="agent-filters"></div>
        <span class="sp"></span>
        <button class="btn quiet" id="bb-toggle"><svg class="ico sm" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg><span data-t="blackboard">Blackboard</span></button>
        <button class="btn primary" id="new-task"><svg class="ico sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span data-t="newTask">New task</span></button>
      </div>
      <div class="board-body" id="board-body">
        <div class="lanes" id="lanes"></div>
        <aside class="bb">
          <div class="hd"><svg class="ico sm" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg><b data-t="blackboard">Blackboard</b><span class="chip" id="bb-count"></span></div>
          <div class="items" id="bb-items"></div>
          <form id="bb-form">
            <input class="field" id="bb-key" data-tp="key" placeholder="key" required>
            <textarea class="field" id="bb-value" rows="3" data-tp="value" placeholder="value" required></textarea>
            <button class="btn quiet" type="submit" data-t="setKey">Set key</button>
          </form>
        </aside>
      </div>
    </div>
  </section>

  <!-- ============ GUIDE ============ -->
  <section class="view" id="v-guide">
    <div class="guide" id="guide-root">${guideHtml()}</div>
  </section>

  <!-- ============ SETTINGS ============ -->
  <section class="view" id="v-settings">
    <div class="settings"><div class="inner" id="settings-root">
      <h1 data-t="settings">Settings</h1>
      <p class="lead" id="set-lead"></p>

      <div class="section">
        <div class="section-hd"><h2 data-t="lang">Reporting language</h2></div>
        <div class="panel pad setting-row">
          <select class="field" id="lang-select" style="max-width:240px"></select>
          <p class="muted" data-t="langS"></p>
        </div>
      </div>

      <div class="section">
        <div class="section-hd"><h2 data-t="roster">Members</h2></div>
        <div class="panel pad explain" id="roles-explain"></div>
        <div class="roster" id="roster"></div>
      </div>

      <div class="section">
        <div class="section-hd"><h2 data-t="limits">Hub limits</h2><p data-t="limitsS"></p></div>
        <div class="tiles" id="tiles"></div>
      </div>

      <div class="section">
        <div class="section-hd"><h2 data-t="sources">Where model lists come from</h2></div>
        <div class="panel pad" id="sources"></div>
      </div>

      <div class="section">
        <div class="section-hd"><h2 data-t="connect">Connect another agent</h2><p data-t="connectS"></p></div>
        <div class="snippet"><span id="endpoint"></span><button class="btn quiet sm" id="copy-endpoint"><svg class="ico sm" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button></div>
      </div>
    </div></div>
  </section>
</main>

<div class="scrim" id="scrim"></div>

<aside class="drawer" id="drawer" aria-label="Task details">
  <div class="dh" id="d-head"></div>
  <div class="db" id="d-body"></div>
  <div class="df" id="d-foot"></div>
</aside>

<div class="modal" id="modal" role="dialog" aria-modal="true">
  <form id="m-form">
    <div class="mh" data-t="newTask">New task</div>
    <div class="mb">
      <select class="field" id="m-to"></select>
      <input class="field" id="m-title" data-tp="title" placeholder="Title">
      <textarea class="field" id="m-prompt" rows="6" data-tp="whatToDo" placeholder="What should this agent do?" required></textarea>
    </div>
    <div class="mf"><button type="button" class="btn quiet" id="m-cancel" data-t="cancel">Cancel</button><button type="submit" class="btn primary" data-t="send">Send</button></div>
  </form>
</div>

<div class="modal browse" id="browse" role="dialog" aria-modal="true">
  <div class="mh"><span data-t="pickFolder">Choose a folder</span></div>
  <div class="browse-bar">
    <button class="btn quiet sm icon" id="browse-up" title="up"><svg class="ico sm" viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
    <button class="btn quiet sm icon" id="browse-home" title="home"><svg class="ico sm" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></button>
    <input class="field mono" id="browse-path" spellcheck="false">
  </div>
  <div class="browse-list" id="browse-list"></div>
  <div class="mf"><span class="browse-here" id="browse-here"></span><button type="button" class="btn quiet" id="browse-cancel" data-t="cancel">Cancel</button><button type="button" class="btn primary" id="browse-pick" data-t="useFolder">Use this folder</button></div>
</div>

<div class="modal palette" id="palette" role="dialog" aria-modal="true">
  <input id="pal-input" data-tp="search" placeholder="Search" autocomplete="off">
  <div class="results" id="pal-results"></div>
  <div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> <span data-t="nav">navigate</span></span><span><kbd>↵</kbd> <span data-t="openK">open</span></span><span><kbd>esc</kbd> <span data-t="closeK">close</span></span></div>
</div>

<div class="toasts" id="toasts"></div>

<script>${CLIENT}</script>
</body>
</html>`;
}
