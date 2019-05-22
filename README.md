# @atomist/sdm-pack-lifecycle

[![npm version](https://img.shields.io/npm/v/@atomist/sdm-pack-lifecycle.svg)](https://www.npmjs.com/package/@atomist/sdm-pack-lifecycle)
[![atomist sdm goals](https://badge.atomist.com/T29E48P34/atomist/sdm-pack-lifecycle/0f0e2fa6-3377-4384-b70a-35bd62355d2f)](https://app.atomist.com/workspace/T29E48P34)

## Extending Lifecycle

To extend lifecycle three different extension points are available:

* `NodeRenderer` is concerned with rendering information as part of the lifecycle message
* `ActionContributor` adds `Action` instances to a lifecycle message pointing to
* `CommandHandlerRegistration` instances to add additional commands

Implementations of the above can be registered wit the Lifecycle support by passing them
as part of the `LifecycleOptions` to the `lifecycleSupport` extension pack.

#### Modifying Lifecycle Message Content

The following example shows a [`CommitMessageWarningPushNodeRenderer`](https://github.com/atomist/sdm-pack-lifecycle/blob/master/test/sample/renderer.ts)
that adds an additional attachment to the push lifecycle to show violations against a commit message formatting policy:

```typescript
/**
 * NodeRenderer implementation that verifies the format of a commit message and
 * adds a Slack attachment showing all format warnings.
 */
export class CommitMessageWarningPushNodeRenderer extends AbstractIdentifiableContribution
    implements SlackNodeRenderer<PushToPushLifecycle.Push> {

    public static ID: string = "commit_message";

    constructor() {
        super(CommitMessageWarningPushNodeRenderer.ID);
    }

    public supports(node: PushToPushLifecycle.Push): boolean {
        return !!node.after;
    }

    public async render(node: PushToPushLifecycle.Push,
                        actions: Action[],
                        msg: SlackMessage,
                        rc: RendererContext): Promise<SlackMessage> {

        if (await isDismissed(node, rc)) {
            return msg;
        }

        const warnings: string[] = [];

        const commitMsg = node.after.message;
        const firstRow = commitMsg.split("\n")[0];

        if (firstRow.charAt(0) !== firstRow.charAt(0).toUpperCase()) {
            warnings.push(`Message doesn't start with an uppercase letter`);
        }
        if (firstRow.length > 50) {
            warnings.push(`First row is longer than 50 characters`);
        }

        if (warnings.length > 0) {
            const attachment: Attachment = {
                author_icon: `https://images.atomist.com/rug/warning-yellow.png`,
                author_name: "Commit Message Format",
                text: `Commit message violates our format policy:\n\n${warnings.map(w => ` * ${w}`).join("\n")}`,
                fallback: "Commit Message Format",
                color: "#D7B958",
                mrkdwn_in: ["text"],
                actions,
            };
            msg.attachments.push(attachment);
        }

        return msg;
    }

}
``` 

The `supports` method gets called for each node of the lifecycle; e.g. the Push, all Commits and Tags etc in case of 
push lifecycle. If `support` returns `true` the render method will be invoked with the supported node.

The `render` method receives the `SlackMessage` that was created by previous `NodeRenderer` instances and can make any
desired modifications to the message content. Additionally all contributed `Action` instances are passed into `render` 
so that those can be placed into the message by the renderer.

#### Adding Lifecycle Actions

The following code block shows an example of an `ActionContributor` that adds a button for a dismiss action to the push
lifecycle. The code is available in [`CommitMessageWarningPushActionContributor`](https://github.com/atomist/sdm-pack-lifecycle/blob/master/test/sample/action.ts).

```typescript
/**
 * ActionContributor adding a button to dismiss the commit message warnings
 */
export class CommitMessageWarningPushActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<PushToPushLifecycle.Push> {

    constructor() {
        super("dismiss_commit_message");
    }

    public supports(node: any, rc: RendererContext): boolean {
        return !!node.after && rc.rendererId === CommitMessageWarningPushNodeRenderer.ID;
    }

    public async buttonsFor(node: PushToPushLifecycle.Push,
                            rc: RendererContext): Promise<Action[]> {

        if (!(await isDismissed(node, rc))) {
            return [
                actionableButton(
                    { text: "Dismiss" },
                    DismissCommitMessageWarningCommand,
                    {
                        owner: node.repo.owner,
                        repo: node.repo.name,
                    }),
            ];
        }

        return [];
    }

    public async menusFor(node: PushToPushLifecycle.Push,
                          rc: RendererContext): Promise<Action[]> {
        return [];
    }
}
```

Similar to `NodeRenderer` instances, the `supports` method can be used to determine if a certain node is supported and
if the action should be placed onto the content created by a particular `NodeRenderer`.

The two methods `buttonsFor` and `menuFor` are then called to create Slack button or menu `Action`s respectively.

#### Configuring Lifecycle Extensions

`NodeRenderer` and `ActionContributor` instances need to be registered with `lifecycleSupport` as follows:

```typescript
    const lifecycleOptions: LifecycleOptions = deepmerge(DefaultLifecycleRenderingOptions, {
        push: {
            chat: {
                renderers: [() => [
                    new CommitMessageWarningPushNodeRenderer(),
                ]],
                actions: [() => [
                    new CommitMessageWarningPushActionContributor(),
                ]],
            },
        },
        commands: [
            DismissCommitMessageWarningCommand,
        ],
    });

    sdm.addExtensionPacks(lifecycleSupport(lifecycleOptions));
```
`DefaultLifecycleRenderingOptions` is a pre-defined configuration that contains all out of the box renderers and action
contributors that this pack contains. This serves as basis to add a new renderer and action contributor to the overall
lfiecycle configuration. 

In addition, this registers a `CommandHandlerRegistration` that implements the dismiss logic that is used to bind to a 
button in the sample `CommitMessageWarningPushActionContributor`.

## Getting started

See the [Developer Quick Start][atomist-quick] to jump straight to
creating an SDM.

[atomist-quick]: https://docs.atomist.com/quick-start/ (Atomist - Developer Quick Start)

## Contributing

Contributions to this project from community members are encouraged
and appreciated. Please review the [Contributing
Guidelines](CONTRIBUTING.md) for more information. Also see the
[Development](#development) section in this document.

## Code of conduct

This project is governed by the [Code of
Conduct](CODE_OF_CONDUCT.md). You are expected to act in accordance
with this code by participating. Please report any unacceptable
behavior to code-of-conduct@atomist.com.

## Documentation

Please see [docs.atomist.com][atomist-doc] for
[developer][atomist-doc-sdm] documentation.

[atomist-doc-sdm]: https://docs.atomist.com/developer/sdm/ (Atomist Documentation - SDM Developer)

## Connect

Follow [@atomist][atomist-twitter] and [The Composition][atomist-blog]
blog related to SDM.

[atomist-twitter]: https://twitter.com/atomist (Atomist on Twitter)
[atomist-blog]: https://the-composition.com/ (The Composition - The Official Atomist Blog)

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist-seeds/sdm-pack/issues

## Development

You will need to install [Node.js][node] to build and test this
project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Install dependencies.

```
$ npm install
```

Use the `build` package script to compile, test, lint, and build the
documentation.

```
$ npm run build
```

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
