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

import { EventFired } from "@atomist/automation-client/lib/HandleEvent";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import { logger } from "@atomist/automation-client/lib/util/logger";
import { SlackMessage } from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    CardMessage,
    newCardMessage,
} from "../../../lifecycle/card";
import {
    Lifecycle,
    LifecycleHandler,
    Preferences,
} from "../../../lifecycle/Lifecycle";
import { ignoredUsers } from "../../../lifecycle/util";
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import { LifecyclePreferences } from "../preferences";

export class IssueCardLifecycleHandler<R> extends LifecycleHandler<R> {

    constructor(private readonly extractNodes: (event: EventFired<R>) => [graphql.IssueToIssueLifecycle.Issue,
                    graphql.IssueFields.Repo,
                    graphql.CommentToIssueLifecycle.Comment,
                    string],
                private readonly contributors: Contributions) {
        super();
    }

    protected prepareMessage(lifecycle: Lifecycle): Promise<CardMessage> {
        const msg = newCardMessage("issue");
        const repo = lifecycle.extract("repo");
        msg.repository = {
            owner: repo.owner,
            name: repo.name,
            slug: `${repo.owner}/${repo.name}`,
        };
        msg.ts = +lifecycle.timestamp;
        return Promise.resolve(msg);
    }

    protected async prepareLifecycle(event: EventFired<R>, ctx: HandlerContext): Promise<Lifecycle[]> {
        const nodes: any[] = [];
        const [issue, repo, comment, timestamp] = this.extractNodes(event);

        if (!!issue) {
            nodes.push(issue);
        }

        if (!!comment) {
            nodes.push(comment);
        }

        // Verify that there is at least a issue and repo node
        if (!issue) {
            logger.debug(`Lifecycle event is missing issue and/or repo node`);
            return null;
        }

        const configuration: Lifecycle = {
            name: LifecyclePreferences.issue.id,
            nodes,
            renderers: _.flatten((this.contributors.renderers || []).map(r => r(repo))),
            contributors: _.flatten((this.contributors.actions || []).map(a => a(repo))),
            id: `issue_lifecycle/${repo.owner}/${repo.name}/${issue.number}`,
            timestamp,
            channels: [{
                name: "atomist:dashboard",
                teamId: ctx.workspaceId,
            }],
            extract: (type: string) => {
                if (type === "repo") {
                    return repo;
                } else if (type === "comment") {
                    return comment;
                }
                return null;
            },
        };

        return [configuration];
    }

    protected processLifecycle(lifecycle: Lifecycle, store: Map<string, any>): Lifecycle {
        store.set("show_more", true);
        return lifecycle;
    }

    protected extractPreferences(event: EventFired<R>): { [teamId: string]: Preferences[] } {
        return {};
    }
}

export class IssueLifecycleHandler<R> extends LifecycleHandler<R> {

    constructor(private readonly extractNodes: (event: EventFired<R>) => [graphql.IssueToIssueLifecycle.Issue, graphql.IssueFields.Repo, string],
                private readonly ep: (event: EventFired<R>) => { [teamId: string]: Preferences[] },
                private readonly contributors: Contributions) {
        super();
    }

    protected prepareMessage(): Promise<SlackMessage> {
        return Promise.resolve({
            text: null,
            attachments: [],
        });
    }

    protected async prepareLifecycle(event: EventFired<R>, ctx: HandlerContext): Promise<Lifecycle[]> {
        const nodes: any[] = [];
        const [issue, repo, timestamp] = this.extractNodes(event);

        if (!!issue) {
            nodes.push(issue);
        }

        // Verify that there is at least a issue and repo node
        if (!issue) {
            logger.debug(`Lifecycle event is missing issue and/or repo node`);
            return null;
        }

        const users = ignoredUsers(event);
        if (users.includes(issue.openedBy.login)) {
            logger.debug(`Lifecycle event from ignored user`);
            return null;
        }

        const configuration: Lifecycle = {
            name: LifecyclePreferences.issue.id,
            nodes,
            renderers: _.flatten((this.contributors.renderers || []).map(r => r(repo))),
            contributors: _.flatten((this.contributors.actions || []).map(a => a(repo))),
            id: `issue_lifecycle/${repo.owner}/${repo.name}/${issue.number}`,
            timestamp,
            channels: repo.channels.map(c => ({ name: c.name, teamId: c.team.id })),
            extract: (type: string) => {
                if (type === "repo") {
                    return repo;
                }
                return null;
            },
        };

        return [configuration];
    }

    protected extractPreferences(event: EventFired<R>): { [teamId: string]: Preferences[] } {
        return this.ep(event);
    }

}
