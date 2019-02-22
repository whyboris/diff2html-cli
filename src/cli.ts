/*
 *
 * Diff to HTML CLI (cli.js)
 * Author: rtfpessoa
 *
 */

type InputType = 'file' | 'stdin';

const fs = require('fs');
const os = require('os');
const path = require('path');

const diff2Html = require('diff2html').Diff2Html;

const log = require('./logger.js').Logger;
const http = require('./http-utils.js').HttpUtils;
const utils = require('./utils.js').Utils;

const ncp = require('copy-paste');
const opn = require('opn');

module.exports = {

  getInput(inputType: InputType, inputArgs: any[], ignore: string[], callback) {
    var that = this;
    switch (inputType) {
      case 'file':
        utils.readFile(inputArgs[0], callback);
        break;

      case 'stdin':
        utils.readStdin(callback);
        break;

      default:
        that._runGitDiff(inputArgs, ignore, callback);
    }
  },

  _runGitDiff(gitArgsArr: string[], ignore: string[], callback) {
    var gitArgs: string;

    if (gitArgsArr.length && gitArgsArr[0]) {
      gitArgs = gitArgsArr.map(function(arg) {
        return '"' + arg + '"'; // wrap parameters
      }).join(' ');
    } else {
      gitArgs = '-M -C HEAD';
    }

    if (gitArgs.indexOf('--no-color') < 0) {
      gitArgs += ' --no-color';
    }

    var ignoreString = '';

    if (ignore) {
      ignoreString = ignore.map(function(file) {
        return ' ":(exclude)' + file + '" ';
      }).join(' ');
    }

    var diffCommand = 'git diff ' + gitArgs + ignoreString;

    return callback(null, utils.runCmd(diffCommand));
  },

  /*
   * Output
   */

  getOutput(baseConfig, input, callback) {
    var that = this;
    var config = baseConfig;
    var defaultTemplate = path.resolve(__dirname, '..', 'dist', 'template.html');
    config.wordByWord = (baseConfig.diff === 'word');
    config.charByChar = (baseConfig.diff === 'char');
    config.template = baseConfig.htmlWrapperTemplate || defaultTemplate;

    if (!fs.existsSync(config.template)) {
      return callback(new Error('Template (`' + baseConfig.template + '`) not found!'));
    }

    var jsonContent = diff2Html.getJsonFromDiff(input, config);

    if (baseConfig.format === 'html') {
      config.inputFormat = 'json';

      if (baseConfig.style === 'side') {
        config.outputFormat = 'side-by-side';
      } else {
        config.outputFormat = 'line-by-line';
      }

      if (baseConfig.summary === 'hidden') {
        config.showFiles = false;
      } else {
        config.showFiles = true;
        config.showFilesOpen = baseConfig.summary === 'open';
      }

      config.synchronisedScroll = (baseConfig.synchronisedScroll === 'enabled');

      var htmlContent = diff2Html.getPrettyHtml(jsonContent, config);
      return callback(null, that._prepareHTML(htmlContent, config));
    } else if (baseConfig.format === 'json') {
      return callback(null, JSON.stringify(jsonContent));
    }

    return callback(new Error('Wrong output format `' + baseConfig.format + '`!'));
  },

  _prepareHTML(content, config) {
    var templatePath = config.template;
    var template = utils.readFileSync(templatePath);

    var diff2htmlPath = path.join(path.dirname(require.resolve('diff2html')), '..');

    var cssFilePath = path.resolve(diff2htmlPath, 'dist', 'diff2html.min.css');
    var cssContent = utils.readFileSync(cssFilePath);

    var jsUiFilePath = path.resolve(diff2htmlPath, 'dist', 'diff2html-ui.min.js');
    var jsUiContent = utils.readFileSync(jsUiFilePath);

    return template
      .replace('<!--diff2html-css-->', '<style>\n' + cssContent + '\n</style>')
      .replace('<!--diff2html-js-ui-->', '<script>\n' + jsUiContent + '\n</script>')
      .replace('//diff2html-fileListCloseable', 'diff2htmlUi.fileListCloseable("#diff", ' + config.showFilesOpen + ');')
      .replace('//diff2html-synchronisedScroll', 'diff2htmlUi.synchronisedScroll("#diff", ' + config.synchronisedScroll + ');')
      .replace('<!--diff2html-diff-->', content);
  },

  /*
   * Output destination
   */

  preview(content, format) {
    var filename = 'diff.' + format;
    var filePath = path.resolve(os.tmpdir(), filename);
    utils.writeFile(filePath, content);
    opn(filePath);
  },

  postToDiffy(diff, postType, callback) {
    var jsonParams = {udiff: diff};

    http.post('http://diffy.org/api/new', jsonParams, function(err, response) {
      if (err) {
        log.error(err);
        return;
      }

      if (response.status !== 'error') {
        log.print('Link powered by diffy.org:');
        log.print(response.url);

        if (postType === 'browser') {
          open(response.url);
          return callback(null, response.url);
        } else if (postType === 'pbcopy') {
          ncp.copy(response.url, function() {
            return callback(null, response.url);
          });
        }
      } else {
        log.error('Error: ' + response.statusCode);
      }
    });
  }

}