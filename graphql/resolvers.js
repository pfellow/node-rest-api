const bcrypt = require('bcrypt');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const { GraphQLError } = require('graphql');

const User = require('../models/user');
const Post = require('../models/post');

const resolvers = {
  Mutation: {
    createUser: async (parent, { userInput }) => {
      const errors = [];
      if (!validator.isEmail(userInput.email)) {
        errors.push({ message: 'E-mail is invalid' });
      }
      if (
        validator.isEmpty(userInput.password) ||
        !validator.isLength(userInput.password, { min: 5 })
      ) {
        errors.push({ message: 'Password too short' });
      }
      if (errors.length > 0) {
        throw new GraphQLError('Incorrect input!', {
          extensions: {
            data: errors,
            code: 422
          }
        });
      }
      const existingUser = await User.findOne({ email: userInput.email });
      if (existingUser) {
        const error = new Error('User exists already!');
        throw error;
      }
      const hashedPw = await bcrypt.hash(userInput.password, 12);
      const user = new User({
        email: userInput.email,
        name: userInput.name,
        password: hashedPw
      });
      const createdUser = await user.save();
      return { ...createdUser._doc, _id: createdUser._id.toString() };
    },
    createPost: async (parent, { postInput }, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const errors = [];
      if (
        validator.isEmpty(postInput.title) ||
        !validator.isLength(postInput.title, { min: 5 })
      ) {
        errors.push({ message: 'Title is invalid!' });
      }
      if (
        validator.isEmpty(postInput.content) ||
        !validator.isLength(postInput.content, { min: 5 })
      ) {
        errors.push({ message: 'Content is invalid!' });
      }
      if (errors.length > 0) {
        throw new GraphQLError('Incorrect input!', {
          extensions: {
            data: errors,
            code: 422
          }
        });
      }
      const user = await User.findById(contextValue.userId);
      if (!user) {
        throw new GraphQLError('Invalid user', {
          extensions: {
            data: errors,
            code: 401
          }
        });
      }
      const post = new Post({
        title: postInput.title,
        content: postInput.content,
        imageUrl: postInput.imageUrl,
        creator: user
      });
      const createdPost = await post.save();
      user.posts.push(createdPost);
      await user.save();
      console.log(createdPost);
      return {
        ...createdPost._doc,
        _id: createdPost._id.toString(),
        createdAt: createdPost.createdAt.toISOString(),
        updatedAt: createdPost.updatedAt.toISOString()
      };
    }
  },
  Query: {
    login: async (parent, { email, password }) => {
      const user = await User.findOne({ email });
      if (!user) {
        throw new GraphQLError('User not found!', {
          extensions: {
            code: 401
          }
        });
      }
      const isEqual = bcrypt.compare(password, user.password);
      if (!isEqual) {
        throw new GraphQLError('Password is incorrect', {
          extensions: {
            code: 401
          }
        });
      }
      const token = jwt.sign(
        {
          email: user.email,
          userId: user._id.toString()
        },
        'secretkey',
        { expiresIn: '1h' }
      );
      return { token, userId: user._id.toString() };
    },
    posts: async (_, __, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const totalPosts = await Post.find().countDocuments();
      const posts = await Post.find()
        .populate('creator')
        .sort({ createdAt: -1 });
      return {
        posts: posts.map((p) => {
          return {
            ...p._doc,
            _id: p._id.toString(),
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString()
          };
        }),
        totalPosts
      };
    }
  }
};

module.exports = resolvers;
