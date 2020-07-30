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

export interface User{
    login: string
}

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
