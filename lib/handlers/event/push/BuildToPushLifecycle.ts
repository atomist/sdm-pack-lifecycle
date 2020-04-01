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
import {
    PushCardLifecycleHandler,
    PushLifecycleHandler,
} from "./PushLifecycle";

/**
 * Send a lifecycle message on Build events.
 */
export function buildToPushLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.BuildToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "BuildToPushLifecycle",
        description: "Send a push lifecycle message on Build events",
        tags: ["lifecycle", "push", "build"],
        parameters: LifecycleParameters,
        subscription: subscription("buildToPushLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.BuildToPushLifecycle.Subscription>(
                e,
                params,
                e.data.Build[0]?.push?.repo,
                ctx,
                () => new PushLifecycleHandler(
                    ev => [ev.data.Build[0].push],
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Build[0].push.repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}

/**
 * Send a lifecycle card on Build events.
 */
export function buildToPushCardLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.BuildToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "BuildToPushCardLifecycle",
        description: "Send a push lifecycle card on Build events",
        tags: ["lifecycle", "push", "build"],
        parameters: LifecycleParameters,
        subscription: subscription("buildToPushLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.BuildToPushLifecycle.Subscription>(
                e,
                params,
                e.data.Build[0]?.push?.repo,
                ctx,
                () => new PushCardLifecycleHandler(
                    ev => [ev.data.Build[0].push],
                    contributions,
                ),
            );
        },
    };
}
