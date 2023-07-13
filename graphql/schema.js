const typeDefs = `
    type Post {
        _id: ID!
        title: String!
        content: String!
        imageUrl: String!
        creator: User!
        createdAt: String!
        updatedAt: String!
    }
    type User {
        _id: ID!
        name: String!
        email: String!
        password: String
        status: String!
        posts: [Post!]!
    }
    type AuthData {
        token: String!
        userId: String!
    }
    type PostData {
        posts: [Post!]
        totalPosts: Int!
    }
    input UserInputData {
        email: String!
        name: String!
        password: String!
    }
    input PostInputData {
        title: String!
        content: String!
        imageUrl: String!
    }
    type Mutation {
        createUser(userInput: UserInputData): User!
        createPost(postInput: PostInputData): Post!
    }
    type Query {
        login(email: String!, password: String!): AuthData!
        posts: PostData!
    }
    schema {
        query: Query
        mutation: Mutation
    }
`;

module.exports = typeDefs;
