/**
 * Client-side script for the hub's web app, assembled from one file per view
 * (./client/*). Each part is a String.raw template, so regexes and escapes
 * arrive in the browser exactly as written; they share one function scope,
 * in this order, so later parts may use anything defined earlier.
 *
 * The one rule inside every part: no backticks and no dollar-brace sequences
 * (they would end or interpolate the template) — plain concatenation only.
 */
import { BASE } from "./client/base.js";
import { CHAT } from "./client/chat.js";
import { BOARD } from "./client/board.js";
import { GUIDE } from "./client/guide.js";
import { SETTINGS } from "./client/settings.js";
import { SHELL } from "./client/shell.js";

const PRELUDE = String.raw`
(function(){
'use strict';

`;
const EPILOGUE = String.raw`
})();
`;

export const CLIENT = PRELUDE + BASE + CHAT + BOARD + GUIDE + SETTINGS + SHELL + EPILOGUE;
