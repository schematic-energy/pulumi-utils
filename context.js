/*
 Copyright (c) 2019 Schematic Energy, LLC
 Released under the terms of the Apache 2.0 License
*/

/** Tools for organizing Pulumi resources into contextual hierarchies */

"use strict";
const pulumi = require("@pulumi/pulumi");
const deepmerge = require('deepmerge');
const isPlainObject = require('is-plain-object');
const aws = require("@pulumi/aws");
const git = require('./git.js');

const merge = function(x, y) {
    return deepmerge(x || {} ,y || {}, { isMergeableObject: isPlainObject });
};

class PulumiContext {
    constructor(props, opts) {
        this.props = props;
        this.opts = opts;
    }

    withProps(props) {
        let ctx = Object.assign(new PulumiContext(),this);
        ctx.props = merge(ctx.props, props);
        return ctx;
    }

    withOpts(opts) {
        let ctx = Object.assign(new PulumiContext(),this);
        ctx.opts = merge(ctx.opts, opts);
        return ctx;
    }

    resource(ctor, name, props, opts) {
        return new ctor(name, merge(this.props, props), merge(this.opts, opts));
    }

    r(ctor, name, props, opts) {
        return this.resource(ctor, name, props, opts);
    }

    withComponent(type, name) {
        let c = new pulumi.ComponentResource(type, name, null, this.opts);
        let newCtx = this.withOpts({parent: c});
        newCtx.group = c;
        return newCtx;
    }

    withGroup(group) {
        return this.withComponent(`group:${group}`, group);
    }

    /** Return a config value with an explicit default. If the config
    /* value is the string 'false', 'none' or 'no', returns boolean false. */
    cfgValue(variable, defaultVal) {
        let val = defaultVal ? this.cfg.get(variable) : this.cfg.require(variable);
        if (typeof val === 'string') {
            let v = val.toLowerCase();
            if (v === 'no' || v === 'false' || v === 'none') {
                val = undefined;
            }
        }
        return val || defaultVal;
    }
};

exports.PulumiContext = PulumiContext;

/**
 * Apply a function to any number of input values, returning a
 * `pulumi.Output`. Essentially a convenience layer over the
 * `pulumi.all` function.
 */
exports.defer = function(f) {
    let inputs = Array.prototype.slice.call(arguments, 1);
    return pulumi.all(inputs).apply(function(vals) {
        return f.apply(null, vals);
    });
};

/** Like JSON.stringify but walks to uncover any deeply nested output. */
exports.stringify = function(obj) {
    return pulumi.output(obj).apply(o => JSON.stringify(o));
};

/** Just to decrease line noise */
exports.i = pulumi.interpolate;

/** Initialize a new pulumi context with standard tags, stack name, config, etc. */
exports.initialize = function(orgName) {
    let tags = { "pulumi:project": pulumi.getProject(),
                 "pulumi:stack": pulumi.getStack(),
                 `orgName:${repo}`: git.repo() };

    let ctx = new PulumiContext().withProps({tags: tags});
    ctx.cfg = new pulumi.Config(pulumi.getProject());
    ctx.env = pulumi.getStack();
    ctx.orgName = orgName;
    ctx.region = pulumi.output(aws.getRegion({}, {async: true})).name;
    ctx.account = pulumi.output(aws.getCallerIdentity({}, {async: true})).accountId;
    return ctx;
};
