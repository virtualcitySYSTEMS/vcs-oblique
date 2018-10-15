/**
 * An URL helper class
 * @constructor
 * @export
 * @memberOf vcs
 */
class Url {
  static get className() { return 'vcs.Url'; }

  /**
   * @param {Object} options
   */
  constructor(options) {
    this.className = Url.className;
    /** @type{string} */
    this.base = options.base;
    this.base.replace('/$', '');

    /** @type{Array<string>} */
    this.path = options.path || [];

    /** @type{Array<string>} */
    this.hashPath = options.hashPath || [];

    /** @type{!Object} */
    this.queryParams = options.queryParams || {};
  }


  /**
   * Adds Query Parameters
   * @param {!Object} queryParams
   */
  addQueryParams(queryParams) {
    Object.keys(queryParams).forEach(function (key) {
      this.queryParams[key] = queryParams[key];
    }, this);
  }

  /**
   * Gets a urls query params
   * @returns {Object<string, *>}
   */
  getQueryParams() {
    return this.queryParams;
  }

  /**
   * Clears the query params
   */
  clearQueryParams() {
    this.queryParams = {};
  }

  /**
   * Sets the path of the url. Each argument is a path directory
   * @param {...string} var_args
   * @return {vcs.Url}
   */
  setPath(var_args) {
    this.path.splice(0, this.path.length);
    for (let i = 0; i < arguments.length; i++) {
      this.path.push(arguments[i].replace('/', ''));
    }
    return this;
  }

  /**
   * Extends the url path, each argument is a path directory
   * @param {...string} var_args
   * @return {vcs.Url}
   */
  extendPath(var_args) {
    for (let i = 0; i < arguments.length; i++) {
      const value = arguments[i].replace('/', '');
      if (/^\.\.$/.test(value)) {
        this.path.pop();
      } else {
        this.path.push(value);
      }
    }
    return this;
  }

  /**
   * Returns a new vcs.Url, a clone of this one
   * @return {!vcs.Url}
   */
  clone() {
    return new Url({
      base: this.base,
      path: this.path.slice(0),
      hashPath: this.hashPath.slice(0),
      queryParams: this._cloneQueryParams(),
    });
  }

  /**
   * Clones the query params
   * @private
   */
  _cloneQueryParams() {
    var extend = function (object) {
      const scratch = {};
      Object.keys(object).forEach((key) => {
        const value = object[key];
        if (Array.isArray(value)) {
          scratch[key] = value.splice(0);
        } else if (typeof value === 'object') {
          scratch[key] = extend(value);
        } else {
          scratch[key] = value;
        }
      }, this);
      return scratch;
    };
    return extend(this.queryParams);
  };

  /**
   * Makes an url with query parameters
   * @return {string}
   */
  toString() {
    let stringUrl = `${this.base}/${this.path.join('/')}`;
    stringUrl = stringUrl.replace(/\/$/, '');
    if (Object.keys(this.queryParams).length > 0) {
      stringUrl += `?${this._getStringQueryParams()}`;
    }
    if (this.hashPath.length > 0) {
      stringUrl += `#${this.hashPath.join('/')}`;
    }
    return stringUrl;
  }

  /**
   * returns the query params as kwp
   * @return {string}
   */
  _getStringQueryParams() {
    return Object.keys(this.queryParams).map(function (key) {
      const value = this.queryParams[key];
      let stringValue;
      if (value instanceof Object) {
        stringValue = JSON.stringify(value);
      } else {
        stringValue = String(value);
      }
      return `${key}=${encodeURIComponent(stringValue)}`; // XXX do I need to encode everything here?
    }, this).join('&');
  }

  /**
   * Parses a string into a vcs.Url if its a valid url
   * @param {string} stringUrl
   * @return {vcs.Url}
   */
  static parse(stringUrl) {
    if (Url.isUrl(stringUrl)) {
      const querySplit = stringUrl.split('?');
      const hashSplit = stringUrl.split('#');
      let query = null;
      if (querySplit.length > 1) {
        const queryBeforeHash = querySplit[1].split('#')[0];
        let queryString = queryBeforeHash;
        if (queryString.endsWith('/')) {
          queryString = queryString.split('/')[0];
        }
        query = Url.parseQueryParams(queryString);
      }

      let hashPath = [];
      if (hashSplit.length > 1) {
        const hashBeforeQuery = hashSplit[1].split('?')[0];
        hashPath = hashBeforeQuery.split('/');
      }

      let path = querySplit[0].split('#')[0].split('/');
      let base;
      if (/^(https?:\/\/).*/.test(stringUrl)) {
        base = path.splice(0, 3).join('/');
      } else {
        base = path.splice(0, 1);
      }

      path = path.filter(pathComponent => pathComponent !== '');
      return new Url({
        base, path, queryParams: query, hashPath,
      });
    }

    throw new Error(`Cannot parse url: ${stringUrl}`);
  }

  /**
   * Parses the query parameters in a url to a JSON
   * @param {string} queryString
   * @return {Object}
   */
  static parseQueryParams(queryString) {
    const kvps = queryString.split('&');
    const queryParams = {};
    kvps.forEach((kvp) => {
      const split = kvp.split('=');
      let value;
      if (split.length === 2 && split[1].length > 0) {
        value = decodeURIComponent(split[1]);

        if (/^\d*\.?\d*$/.test(value)) {
          value = Number(value);
        } else if (/^(\[|\{)(.*)(\]|\})$/.test(value)) {
          value = JSON.parse(value);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        }
      }
      const exists = queryParams[split[0]];
      if (exists) {
        if (Array.isArray(exists)) {
          exists.push(value);
        } else {
          queryParams[split[0]] = [exists, value];
        }
      } else {
        queryParams[split[0]] = value;
      }
    });

    return queryParams;
  }

  /**
   * Tests whether the string representation of a URL is valid
   * Regex from https://mathiasbynens.be/demo/url-regex @Jeffrey Friedl
   * @param {string} url
   * @return {boolean}
   */
  static isUrl(url) {
    const regEx = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
    return regEx.test(url);
  }

  /**
   * @param {string} url to check
   * @return {boolean} if the url has the same origin as the current domain
   */
  static hasSameOrigin(url) {
    // relative Url, return true;
    if (!/^[a-z][a-z0-9+.-]*:/.test(url)) {
      return true;
    }
    const currentUri = Url.parse(window.location.href);
    const uri = Url.parse(url);
    if (currentUri.base.toLowerCase() === uri.base.toLocaleLowerCase()) {
      return true;
    }
    return false;
  };
}


export default Url;
