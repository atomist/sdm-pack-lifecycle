/*
 * Copyright © 2020 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { configure } from "@atomist/sdm/lib/core/machine/configure";
import * as deepmerge from "deepmerge";
import {
    DefaultLifecycleRenderingOptions,
    LifecycleOptions,
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

    // sdm.addExtensionPacks(lifecycleSupport(lifecycleOptions));

    // sdm.addEvent(RebaseOnPush);
});
