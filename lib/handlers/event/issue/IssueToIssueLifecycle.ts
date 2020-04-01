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
import { Maker } from "@atomist/automation-client/lib/util/constructionUtils";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import * as _ from "lodash";
import {
    lifecycle,
    LifecycleHandler,
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import { chatTeamsToPreferences } from "../../../lifecycle/util";
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import {
    IssueCardLifecycleHandler,
    IssueLifecycleHandler,
} from "./IssueLifecycle";

/**
 * Send a lifecycle message on Issue events.
 */
export function issueToIssueLifecycle(contributions: Contributions,
                                      maker?: Maker<LifecycleHandler<graphql.IssueToIssueLifecycle.Subscription>>)
    : EventHandlerRegistration<graphql.IssueToIssueLifecycle.Subscription, LifecycleParametersDefinition> {

    const defaultMaker: Maker<LifecycleHandler<graphql.IssueToIssueLifecycle.Subscription>> = () => new IssueLifecycleHandler(
        e => {
            const issue = e.data.Issue[0];
            const repo = e.data.Issue[0].repo;
            return [issue, repo, Date.now().toString()];
        },
        e => chatTeamsToPreferences(
            _.get(e, "data.Issue[0].repo.org.team.chatTeams")),
        contributions,
    );

    return {
        name: "IssueToIssueLifecycle",
        description: "Send a issue lifecycle message on Build events",
        tags: ["lifecycle", "issue"],
        parameters: LifecycleParameters,
        subscription: subscription("issueToIssueLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.IssueToIssueLifecycle.Subscription>(
                e,
                params,
                e.data.Issue[0]?.repo,
                ctx,
                !!maker ? maker : defaultMaker,
            );
        },
    };
}

/**
 * Send a lifecycle card on Issue events.
 */
export function issueToIssueCardLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.IssueToIssueLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "IssueToIssueCardLifecycle",
        description: "Send a issue lifecycle card on Issue events",
        tags: ["lifecycle", "issue"],
        parameters: LifecycleParameters,
        subscription: subscription("issueToIssueLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.IssueToIssueLifecycle.Subscription>(
                e,
                params,
                e.data.Issue[0].repo,
                ctx,
                () => new IssueCardLifecycleHandler(
                    ev => {
                        const issue = ev.data.Issue[0];
                        const repo = ev.data.Issue[0].repo;
                        return [issue, repo, null, Date.now().toString()];
                    },
                    contributions,
                ),
            );
        },
    };
}
