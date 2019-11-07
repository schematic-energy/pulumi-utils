/*
 Copyright (c) 2019 Schematic Energy, LLC
 Released under the terms of the Apache 2.0 License
*/

"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const pu = require("./context.js");

/** Generate an AWS Assume Role policy granting access to the given services */
exports.assumeRolePolicy = function(services) {
    return JSON.stringify({
        "Version": "2008-10-17",
        "Statement": [
            {
                "Sid": "",
                "Effect": "Allow",
                "Principal": {
                    "Service": services.map(s => `${s}.amazonaws.com`)
                },
                "Action": "sts:AssumeRole"
            }
        ]
    });
};

/** Generate an AWS IAM Policy string comprising the given statement
 * fragments. Fragments are Pulumi Inputs. */
exports.policyJSON = function(statements) {
    return pu.stringify({ Version: "2012-10-17",
                          Statement: statements });
};

exports.policy = function(ctx, name, description, statements) {
    return ctx.r(aws.iam.Policy, name, {
        description: description,
        policy: exports.policyJSON(statements)
    });
};

/** Generate an AWS IAM Policy Statement that grants "Allow" to the
 * specified resource, for the given list of actions.
 * @param {pulumi.Input} resource - The resource to authorize
 * @param {string array} actions - Actions to allow
 */
exports.policyStmt = function(resource, actions) {
    let policy = { Resource: resource,
                   Effect: "Allow",
                   Action: actions };
    return policy;
};

/** Create a role/policy attachment. Role & Policy can be resources or
 * roleName/policyArn, respectively.
 */
exports.attach = function(ctx, name, role, policy) {

    return ctx.r(aws.iam.RolePolicyAttachment, name, {
        role: role.name || role,
        policyArn: policy
    });
};

exports.role = function(ctx, name, opts) {
    ctx = ctx.withGroup(`role:${name}`);

    let { services, policies, statements, passRole } = opts;

    let role = ctx.r(aws.iam.Role, "role", {
        assumeRolePolicy: exports.assumeRolePolicy(services),
        name: `${name}-${ctx.env}`,
    });

    policies = policies || [];

    if (passRole) {
        let statement = exports.policyStmt(role.arn, ["iam:PassRole", "iam:GetRole"]);
        if (statements) {
            statements.push(statement);
        } else {
            statements = [statement];
        }
    };

    if(statements) {
        statements = pulumi.output(statements).apply(stmts => stmts.flat());
        let newPolicy = ctx.r(aws.iam.Policy, name, {
            policy: exports.policyJSON(statements)
        });
        policies.push(newPolicy.arn);
    }

    let attachments = policies.map((policy, i) => {
        return exports.attach(ctx, `role-policy-attachment-${i}`, role, policy);
    });

    return {role: role, attachments: attachments};
};

/** Bundled function to create an instance profile, with associated
 * role and policy attachments
 */
exports.instanceProfile = function (ctx, name, allowedServices, policies) {
    ctx = ctx.withComponent("wylan:instanceProfile", name);

    let role = ctx.r(aws.iam.Role, "role", {
        assumeRolePolicy: exports.assumeRolePolicy(allowedServices),
        name: `${name}-${ctx.env}`,
    });

    policies.map((policy, i) => {
        exports.attach(ctx, `role-policy-attachment-${i}`, role, policy);
    });

    let profile = ctx.r(aws.iam.InstanceProfile, "profile", {
        name: pu.i `${name}-${ctx.env}`,
        role: role.name
    });

    return profile;
};
