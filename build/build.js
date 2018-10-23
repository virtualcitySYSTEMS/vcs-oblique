const program = require('commander');
const webpack = require('webpack');
const config = require('./webpack.base');

program
  .option('-m, --mode [mode]', 'the webpack mode to user', 'production')
  .option('-w, --watch')
  .parse(process.argv);

config.mode = program.mode;

if (program.mode === 'development') {
  config.devtool = 'cheap-source-map';
}
config.devtool = 'source-map';

const compiler = webpack(config);

if (program.watch) {
  compiler.watch({
    aggregateTimeout: 300,
    poll: undefined,
  }, (err) => {
    if (err) {
      console.log(err.message);
    } else {
      console.log('compiled ...');
    }
  });
} else {
  compiler.run((err, stats) => {
    if (stats.hasErrors()) {
      console.log(stats.compilation.errors);
    }
  });
}
