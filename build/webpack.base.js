const path = require('path');

const isCoverage = process.env.NODE_ENV === 'coverage';

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, '..', 'dist'),
    filename: 'vcs-oblique.min.js',
  },
  target: 'web',
  module: {
    rules: [].concat(
      isCoverage ? {
        test: /\.js$/,
        include: [path.resolve(__dirname, '..', 'src')],
        loader: 'istanbul-instrumenter-loader',
      } : [],
      {
        test: /\.js$/,
        include: [path.resolve(__dirname, '..', 'src')],
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env'],
            plugins: ['transform-runtime'],
          },
        },
      },
    ),
  },
};
