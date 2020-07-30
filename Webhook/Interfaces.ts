/**
 * The format of the comments section of GraphQL response
 *
 * @export
 * @interface CommentsResponse
 */
export interface CommentsResponse {
    node: {
        bodyText: string;
        author: {
            login: string;
        };
    };
}

/**
 * The format of the issue response for GraphQL query
 *
 * @export
 * @interface IssueResponse
 */
export interface IssueResponse {
    repository: {
        bodyText: string,
        id: string,
        title: string,
        issue: {
            id: string,
            comments: {
                edges: CommentsResponse[]
            },
            bodyText: string
        }
    }
}

/**
 * The format of user responses in GitHub Api events
 *
 * @export
 * @interface User
 */
export interface User{
    login: string
}

/**
 * The format of a GitHub webhook event
 *
 * @export
 * @interface EventResponse
 */
export interface EventResponse{
    action: string,
    issue: {
        url: string,
        id: number,
        node_id: string,
        number: number,
        title: string,
        user: User,
        labels: {
            name: string
        }[],
        body:string
    },
    repository: {
        id: number,
        name: string,
        owner: User,
        html_url: string
    },
    installation: {
        id: number
    },
    comment: {
        url: string,
        id: number,
        user: User,
        body: string
    },
    label: {
        name: string,
        description: string
    },
    sender: User,
    assignee: User
}
