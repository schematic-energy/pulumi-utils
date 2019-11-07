# Schematic Pulumi Utils

This is a small library that encodes a set of best practices and
utilities for Pulumi+Node+AWS projects, with the following goals:

- Permit a more functional programming style
- Provide a set of design patterns which allow reuse and abstraction
  across very large Pulumi stacks
- Provide utility functions to DRY up common Pulumi code

Each top-level module provides a different set of functionality.

## License

The entire contents of this repository are © Schematic Energy, LLC,
2019, and released under the terms of the Apache 2.0 Open Source
license (see [LICENSE.txt](LICENSE.txt)).

## `context.js`

Organizes Pulumi projects into nested contextual hierarchies, built
using a functional programming style. Contexts are Pulumi Component
resources that allow properties to be applied to all resources in a
context (and its nested contexts.) For example, it is possible to
declare AWS Tags on a context, and all resources in that context will
inherit the same AWS tag properties.

To create a new top level context, call the `context/initialize`
function. This will return a new `PulumiContext` object with the
following AWS tags that will be applied to all nested resources:

- `pulumi:project` - The name of the Pulumi project
- `pulumi:stack`- The name of the Pulumi stack
- `<org-name>:repo` - the Git repository containing the current code

For example:

```
const pu = require("pulumi-utils/context");
const ctx = pu.initialize("my-project");
```

The context object returned by `initialize` also provides properties
for the Pulumi config, under `ctx.cfg`, and for the AWS region and
account, under `ctx.region` and `ctx.account`.

### Resources

To create a resource within a context, invoke the `ctx.resource`
(aliased to `ctx.r`, for brevity) method, passing in the Pulumi
resource class, the name of the element, and the resource
properties map.

For example, instead of using this basic Pulumi code:

```
const bucket = new aws.s3.Bucket("my-bucket", {
    name: "some-bucket.example.com",
    acl: "private"
});
```

You can do the following:

```
const bucket = ctx.r(aws.s3.Bucket, "my-bucket", {
    name: "some-bucket.example.com",
    acl: "private"
});
```

The benefits of using the resource constructor are as follows:

- The Pulumi resource name `my-bucket` is scoped to the immediate
  context: it is not required to be unique across the entire Pulumi
  stack.
- The resource will automatically inherit any resource properties from
  the context. For example, at a minimum, the bucket will be created
  with tags for `pulumi:project`, `pulumi:stack` and the project Git
  repository.

### Nested Contexts

To create a nested context, use the `ctx.withProps` or `ctx.withOpts`
methods. Each of these return a new (not updated!) context that
inherits all of the parent's properties and options, plus a new set of
properties or options (respectively). The new properties or options
are deep-merged with those of the parent context.

For example:

```
let newCtx = ctx.withProps({tags: {"owner", "Luke"}})
```

All resources created using `newCtx` will have an "owner" tag with a
value of "Luke".

You can also override Pulumi options:

```
const otherAccountCtx = ctx.withOpts({provider: myOtherAccountProvider()});
```

In this scenario, all resources created using `otherAccountCtx` will
use the Pulumi provider returned by `myOtherAccountProvider` instead
of the default provider (or whatever was defined for the parent
context.)

### Groups

A common use case is to group sets of Pulumi resources by parenting
them to common `pulumi.ComponentResource` component. This library
facilitates doing this in a functional style using the `ctx.group`
function. This function creates a new `pulumi.ComponentResource` and
returns a new context, with a `parent` Pulumi option such that all
resources have their `ComponentResource` as their parent.


A very small example of a functional program structure this way:


```
const pu = require("pulumi-utils/context");


function main() {
    const ctx = pu.initialize("myproject");

    // define various top-level resources

    staticResources(ctx);

    // other top-level resources
}

function staticResources(ctx) {
    ctx = ctx.withGroup("staticResources");

    let bucket = ctx.r(aws.s3.Bucket, "my-bucket", {
        // properties ...
    });
}
```

In this scenario, all the resources defined in the `staticResources`
function will be grouped together under the same parent
`ComponentResource`, and its easy to modify the properties or options
of all these resources in a single place.

## `git.js`

Contains utility functions for working with project contained in Git
repositories.

- `repo` gets the project's Git repository
- `sha` returns the SHA of the current checked out commit
- `isClean` tells if there are uncommited changes
- `versionStr` generates a git-based version string, of the form
  `<commit-number>-<commit-sha>`, for example, `42-ab123c`. This
  represents a version of the softare using the 42nd commit, with the SHA `ab123c`.

Schematic Energy's projects use this versioning scheme pervasively. It
is useful because it encodes both a human-readable element, allowing
easy comparison of whether one version is before or after another,
while still precisely identifying a specific unique commit.

## `iam.js`

Contains utility functions for generating AWS IAM policies, roles and
instance profiles with Pulumi. Mostly these funtcions just DRY up the
often repetitive nature of role and policy generation.

## `script.js`

Defines a custom Pulumi resource (via `pulumi.dynamic.Resource`) that
runs a local command for its `create` and `update` lifecycle
events. This is useful for synchronizing Pulumi deployments with
various operational tasks.

## `docker.js`

Contains utility functions for generating AWS ECS task definitions.

Also contains a utility function for running an single-execution ECS
task as a Resource, as part of a Pulumi deployment. The task will
execute during the `create` and `update` phases of the corresponding
Pulumi resource.

This pattern is useful when it is necessary to execute some arbitrary
code in an AWS environment as part of deployment: for example, running
database migrations.
