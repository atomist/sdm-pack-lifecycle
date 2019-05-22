import { configure } from "@atomist/sdm-core";
import * as deepmerge from "deepmerge";
import {
    DefaultLifecycleRenderingOptions,
    LifecycleOptions,
    lifecycleSupport,
} from "../lib/lifecycleSupport";
import {
    CommitMessageWarningPushActionContributor,
    DismissCommitMessageWarningCommand,
} from "./sample/action";
import { CommitMessageWarningPushNodeRenderer } from "./sample/renderer";

export const configuration = configure(async sdm => {

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
});
