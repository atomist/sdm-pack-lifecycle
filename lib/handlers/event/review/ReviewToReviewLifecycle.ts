/*
 * Copyright © 2019 Atomist, Inc.
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
import { ReviewLifecycleHandler } from "./ReviewLifecycle";

/**
 * Send a lifecycle message on Review events.
 */
export function reviewToReviewLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.ReviewToReviewLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "ReviewToReviewLifecycle",
        description: "Send a review lifecycle message on Review events",
        tags: ["lifecycle", "review"],
        parameters: LifecycleParameters,
        subscription: subscription("reviewToReviewLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.ReviewToReviewLifecycle.Subscription>(
                e,
                params,
                ctx,
                () => new ReviewLifecycleHandler(
                    ev => [ev.data.Review, _.get(ev, "data.Review[0].timestamp")],
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Review[0].pullRequest.repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}
