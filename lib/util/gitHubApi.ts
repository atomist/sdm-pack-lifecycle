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

import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import {
    failure,
    HandlerError,
    HandlerResult,
    Success,
} from "@atomist/automation-client/lib/HandlerResult";
import { MessageOptions } from "@atomist/automation-client/lib/spi/message/MessageClient";
import { logger } from "@atomist/automation-client/lib/util/logger";
import { slackErrorMessage } from "@atomist/sdm/lib/api-helper/misc/slack/messages";
import * as github from "@octokit/rest";

// Install the throttling plugin
// tslint:disable:no-var-requires
github.plugin(require("@octokit/plugin-throttling"));

export const DefaultGitHubApiUrl = "https://api.github.com/";
export const DefaultGitHubUrl = "https://github.com/";
export const DefaultGitHubProviderId = "zjlmxjzwhurspem";

export function api(token: string, apiUrl: string = DefaultGitHubApiUrl): github {
    const url = new URL(apiUrl);
    return new github({
        auth: `token ${token}`,
        baseUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
        throttle: {
            onRateLimit: (retryAfter: any, options: any) => {
                logger.warn(`Request quota exhausted for request '${options.method} ${options.url}'`);

                if (options.request.retryCount === 0) { // only retries once
                    logger.debug(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
                return false;
            },
            onAbuseLimit: (retryAfter: any, options: any) => {
                logger.warn(`Abuse detected for request '${options.method} ${options.url}'`);
            },
        },
    });
}

export function handleError(title: string,
                            err: any,
                            ctx: HandlerContext,
                            options?: MessageOptions): Promise<HandlerResult> | HandlerError {
    switch (err.code) {
        case 400:
        case 422:
            return ctx.messageClient.respond(
                slackErrorMessage(
                    title,
                    "The request contained errors.",
                    ctx,
                ),
                options)
                .then(() => Success, failure);
        case 403:
        case 404:
            return ctx.messageClient.respond(
                slackErrorMessage(
                    title,
                    "You are not authorized to access the requested resource.",
                    ctx,
                ),
                options)
                .then(() => Success, failure);
        default:
            if (err.message) {
                const body = JSON.parse(err.message);
                const message = body.message ? body.message : "Error occurred. Please contact support.";
                return ctx.messageClient.respond(
                    slackErrorMessage(
                        title,
                        message.endsWith(".") ? message : `${message}.`,
                        ctx,
                    ),
                    options)
                    .then(() => Success, failure);
            }
            return failure(err);

    }
}
