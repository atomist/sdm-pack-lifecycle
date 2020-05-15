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

import { subscription } from "@atomist/automation-client/lib/graph/graphQL";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import * as _ from "lodash";
import {
    lifecycle,
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import { chatTeamsToPreferences } from "../../../lifecycle/util";
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import { PushLifecycleHandler } from "./PushLifecycle";

/**
 * Send a Push lifecycle message on CheckRun events.
 */
export function checkToPushLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.CheckToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "CheckToPushLifecycle",
        description: "Send a push lifecycle message on CheckRun events",
        tags: ["lifecycle", "push", "check"],
        parameters: LifecycleParameters,
        subscription: subscription("checkToPushLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.CheckToPushLifecycle.Subscription>(
                e,
                params,
                e.data.CheckRun[0]?.checkSuite?.commit?.pushes[0]?.repo,
                ctx,
                () => new PushLifecycleHandler(
                    ev => ev.data.CheckRun[0].checkSuite?.commit.pushes,
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.CheckRun[0].checkSuite.commit.pushes[0].repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}