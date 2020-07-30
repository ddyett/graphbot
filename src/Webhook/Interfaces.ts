export interface CommentsQL {
    node: {
        bodyText: string;
        author: {
            login: string;
        };
    };
}

export interface IssueResponse {
    repository: {
        bodyText: string,
        id: string,
        title: string,
        issue: {
            comments: {
                edges: CommentsQL[]
            },
            bodyText: string
        }
    }
}

export interface EventResponse{
    action: string,
    issue: {
        url: string,
        id: number,
        node_id: string,
        number: number,
        title: string,
        user: {
            login: string
        }
        labels: {
            name: string
        }[],
        body:string
    },
    repository: {
        id: number,
        name: string,
        owner: {
            login: string
        },
        html_url: string
    },
    installation: {
        id: number
    },
    comment: {
        url: string,
        id: number,
        user: {
            login: string
        },
        body: string
    },
    label: {
        name: string,
        description: string
    }
}
