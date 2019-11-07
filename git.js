/*
 Copyright (c) 2019 Schematic Energy, LLC
 Released under the terms of the Apache 2.0 License
*/

"use strict";

const proc = require('child_process');

/** Return the URL of the current repo */
exports.repo = function() {
    return proc.execSync("git config --get remote.origin.url", {encoding: "utf-8"}).trim();
};

/** Return the short Git sha of the current repo */
exports.sha = function() {
    return proc.execSync("git rev-parse --short HEAD", {encoding: "utf-8"}).trim();
};

/** Return true if the git repository has no uncommitted fil */
exports.isClean = function() {
    let result = proc.execSync("git status --porcelain", {encoding: "utf-8"});
    return !result.trim();
};

/** Return a version obtained by concatenating the number of commits
 * and the short SHA (i.e, nicely sortable).
 */
exports.versionStr = function() {
    return proc.execSync("git rev-list --count HEAD", {encoding: "utf-8"}).trim()
        + "-"
        + proc.execSync("git rev-parse --short HEAD", {encoding: "utf-8"}).trim()
        + (exports.isClean() ? "" : "-dirty");
};
