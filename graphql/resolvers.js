const path = require('path');
const fs = require('fs');

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
      return {
        ...createdPost._doc,
        _id: createdPost._id.toString(),
        createdAt: createdPost.createdAt.toISOString(),
        updatedAt: createdPost.updatedAt.toISOString()
      };
    },
    updatePost: async (parent, { postId, postInput }, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const post = await Post.findById(postId).populate('creator');
      if (!post) {
        throw new GraphQLError('Post not found!', {
          extensions: {
            code: 404
          }
        });
      }
      if (post.creator._id.toString() !== contextValue.userId.toString()) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 403
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
      post.title = postInput.title;
      post.content = postInput.content;
      if (postInput.imageUrl !== 'undefined') {
        post.imageUrl = postInput.imageUrl;
      }
      const updatedPost = await post.save();
      return {
        ...updatedPost._doc,
        _id: updatedPost._id.toString(),
        createdAt: updatedPost.createdAt.toISOString(),
        updatedAt: updatedPost.updatedAt.toISOString()
      };
    },
    deletePost: async (parent, { postId }, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const post = await Post.findById(postId);
      if (!post) {
        throw new GraphQLError('Post not found!', {
          extensions: {
            code: 404
          }
        });
      }
      if (post.creator._id.toString() !== contextValue.userId.toString()) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 403
          }
        });
      }

      await Post.findByIdAndRemove(postId);
      clearImage(post.imageUrl);
      const user = await User.findById(contextValue.userId);
      user.posts.pull(postId);
      await user.save();
      return true;
    },
    updateStatus: async (parent, { status }, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const user = await User.findById(contextValue.userId);
      if (!user) {
        throw new GraphQLError('User not found!', {
          extensions: {
            code: 404
          }
        });
      }
      user.status = status;
      await user.save();
      return { ...user._doc, _id: user._id.toString() };
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
    posts: async (_, { page }, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      if (!page) {
        page = 1;
      }
      const perPage = 2;
      const totalPosts = await Post.find().countDocuments();
      const posts = await Post.find()
        .populate('creator')
        .skip((page - 1) * perPage)
        .limit(perPage)
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
    },
    post: async (parent, { postId }, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const post = await Post.findById(postId).populate('creator');
      if (!post) {
        throw new GraphQLError('Post not found!', {
          extensions: {
            code: 404
          }
        });
      }
      return {
        ...post._doc,
        _id: post._id.toString(),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString()
      };
    },
    user: async (parent, _, contextValue) => {
      if (!contextValue.isAuth) {
        throw new GraphQLError('Not Authenticated', {
          extensions: {
            code: 401
          }
        });
      }
      const user = await User.findById(contextValue.userId);
      if (!user) {
        throw new GraphQLError('User not found!', {
          extensions: {
            code: 404
          }
        });
      }
      return { ...user._doc, _id: user._id.toString() };
    }
  }
};

const clearImage = (imageUrl) => {
  const filePath = path.join(__dirname, '..', imageUrl);
  fs.unlink(filePath, (err) => {
    if (err) {
      console.log(err);
    }
  });
};

module.exports = resolvers;
