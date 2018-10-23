/* eslint-disable no-console,class-methods-use-this */

/**
 * @namespace oblique
 * @memberOf vcs
 * @api stable
 */

import uuidv4 from 'uuid/v4';
import axios from 'axios/index';
import ImageMeta from './imageMeta';
import Image from './image';
import Camera from './camera';
import OLView from './oLView';
import { parseInt } from '../vcs';
import Direction from './direction';


/**
 * @typedef {Object} vcs.oblique.Collection.Options
 * @property {Cesium.CesiumTerrainProvider|null} terrainProvider
 * @property {ol.proj.Projection|null} projection
 * @property {number} [minZoom=0]
 * @property {number} [hideLevels=0]
 * @api
 */

/**
 * @constructor
 * @memberOf vcs.oblique
 * @api
 */
class Collection {
  /**
   * @param {vcs.oblique.Collection.Options} options
   */
  constructor(options) {
    /** @type {?Cesium.CesiumTerrainProvider} */
    this.terrainProvider = options.terrainProvider || null;

    /** @type {?ol.proj.Projection} */
    this.projection = options.projection || null;

    /** @type {Object.<vcs.oblique.ViewDirection, vcs.oblique.Direction>} */
    this.directions = {};

    /** @type {vcs.oblique.Collection.Options} */
    this.options = options;

    /** @type {Array.<vcs.oblique.ImageMeta>} */
    this.meta = [];

    /** @type {ol.Extent} */
    this.extent = ol.extent.createEmpty();
  }

  /**
   * loads oblique image meta data
   * @param {string|Array.<string>} url
   * @return {Promise}
   * @api
   */
  loadData(url) {
    const promises = [];
    const urls = Array.isArray(url) ? url : [url];

    const axiosInstance = axios.create();
    axiosInstance.interceptors.response.use((response) => {
      return response;
    }, (error) => {
      if (!String(error.response.status).startsWith('4') || !error.config || error.config.retriedWithNewURL) {
        return Promise.reject(error);
      }
      error.config.retriedWithNewURL = true;
      error.config.url = `${error.config.url}/image.json`; // add imagejson as a fallback
      return axiosInstance.request(error.config);
    });

    urls.forEach((innerUrl) => {
      promises.push(axiosInstance.get(innerUrl)
        .then(({ data, config }) => {
          const baseUrl = config.url.substring(0, config.url.lastIndexOf('/'));
          this.handleMetadataResponse(data, baseUrl);
        })
        .catch((err) => {
          console.log(`Invalid image.json data. Please correct, File: ${innerUrl}, Error ${err.message}`);
        }));
    });
    return Promise.all(promises);
  }

  handleMetadataResponse(json, url) {
    const version = Collection.getVersion(json);

    if (version.version >= 3.5 || (version.version === 3.4 && version.buildNumber >= 36)) {
      this.handleMetadataResponseV35(json, url, version);
    } else {
      console.log('Could not load Meta Data, only meta data version 3.5 and higher are supported');
    }
  }

  getImageMeta(url, size, tileResolution, tileSize, minZoom, version, hideLevels) {
    const useTileResolution = hideLevels ?
      tileResolution.slice(0, tileResolution.length - this.options.hideLevels) :
      tileResolution;
    const foundMeta = this.meta.find((item) => {
      return item.isEqual(url, size, useTileResolution);
    });
    if (foundMeta) {
      return foundMeta;
    }
    const defaultView = new OLView({
      url,
      size,
      tileSize,
      tileResolution: useTileResolution,
      minZoom: parseInt(minZoom, 0),
    });
    const meta = new ImageMeta({
      size,
      view: defaultView,
      version: version.version,
      buildNumber: version.buildNumber,
    });
    this.meta.push(meta);
    return meta;
  }
  handleMetadataResponseV35(json, url, version) {
    const size = /** @type {ol.Size} */ ([json.generalImageInfo.width, json.generalImageInfo.height]);
    const tileResolution = json.generalImageInfo['tile-resolution'];
    const tileSize = /** @type {ol.Size} */ ([json.generalImageInfo['tile-width'], json.generalImageInfo['tile-width']]);
    if (json.generalImageInfo.width && json.generalImageInfo.height && json.generalImageInfo['tile-resolution']) {
      this.getImageMeta(url, size, tileResolution, tileSize, this.options.minZoom, version, this.options.hideLevels);
    }
    const cameras = [];

    if (json.generalImageInfo.cameraParameter && Array.isArray(json.generalImageInfo.cameraParameter)) {
      json.generalImageInfo.cameraParameter.forEach((cameraOption) => {
        cameras.push(new Camera(cameraOption));
      });
    }
    let imageProjection = null;
    if (json.generalImageInfo.crs && global.proj4 && global.proj.defs) {
      const crsUuid = uuidv4();
      // @ts-ignore
      global.proj4.defs(crsUuid, json.generalImageInfo.crs);
      imageProjection = ol.proj.get(crsUuid);
    }

    const imagesHeader = json.images.shift();
    const indices = {
      name: imagesHeader.indexOf('name'),
      width: imagesHeader.indexOf('width'),
      height: imagesHeader.indexOf('height'),
      tileResolution: imagesHeader.indexOf('tile-resolution'),
      viewDirection: imagesHeader.indexOf('view-direction'),
      viewDirectionAngle: imagesHeader.indexOf('view-direction-angle'),
      groundCoordinates: imagesHeader.indexOf('groundCoordinates'),
      centerPointOnGround: imagesHeader.indexOf('centerPointOnGround'),
      cameraIndex: imagesHeader.indexOf('camera-index'),
      projectionCenter: imagesHeader.indexOf('projection-center'),
      pToRealworld: imagesHeader.indexOf('p-to-realworld'),
      pToImage: imagesHeader.indexOf('p-to-image'),
    };
    const directionOptions = {};
    json.images.forEach((img) => {
      const coordsArrayPToRealworld = [];
      if (img[indices.pToRealworld]) {
        img[indices.pToRealworld].forEach((value) => {
          coordsArrayPToRealworld.push(...value);
        });
      }
      const pToRealworld = img[indices.pToRealworld] ? new Cesium.Matrix3(...coordsArrayPToRealworld) : null;

      const coordsArrayPToImage = [];
      if (img[indices.pToImage]) {
        img[indices.pToImage].forEach((value) => {
          coordsArrayPToImage.push(...value);
        });
        coordsArrayPToImage.push(0, 0, 0, 1);
      }
      const projectionCenter = img[indices.projectionCenter] ?
        Cesium.Cartesian3.fromArray(img[indices.projectionCenter]) :
        null;
      const pToImage = img[indices.pToImage] ? new Cesium.Matrix4(...coordsArrayPToImage) : null;
      const imageSize = img[indices.width] && img[indices.height] ? [img[indices.width], img[indices.height]] : size;
      const imageTileResolution = img[indices.tileResolution] ? img[indices.tileResolution] : tileResolution;
      const meta = this.getImageMeta(
        url,
        imageSize,
        imageTileResolution,
        tileSize,
        this.options.minZoom,
        version,
        this.options.hideLevels,
      );
      const imageOptions = {
        name: img[indices.name],
        viewDirection: img[indices.viewDirection],
        viewDirectionAngle: img[indices.viewDirectionAngle],
        groundCoordinates: img[indices.groundCoordinates],
        centerPointOnGround: img[indices.centerPointOnGround],
        meta,
        camera: cameras[img[indices.cameraIndex]],
        projectionCenter,
        pToRealworld,
        pToImage,
        projection: this.projection || imageProjection,
        terrainProvider: this.terrainProvider,
      };
      const image = new Image(imageOptions);
      if (!directionOptions[image.viewDirection]) {
        directionOptions[image.viewDirection] = {
          direction: image.viewDirection,
          images: {},
          rTreeItems: [],
          footPrintFeatures: [],
          projection: this.projection || imageProjection,
          terrainProvider: this.terrainProvider,
        };
      }
      directionOptions[image.viewDirection].images[image.name] = image;
      directionOptions[image.viewDirection].rTreeItems.push({
        minX: image.centerPointOnGround[0],
        minY: image.centerPointOnGround[1],
        maxX: image.centerPointOnGround[0],
        maxY: image.centerPointOnGround[1],
        name: image.name,
      });
      const geometry = new ol.geom.Polygon([image.groundCoordinates.concat([image.groundCoordinates[0]])]);
      geometry.transform(this.projection || imageProjection, ol.proj.get('EPSG:3857'));
      const feature = new ol.Feature({ geometry });
      feature.setId(image.name);
      directionOptions[image.viewDirection].footPrintFeatures.push(feature);
    });
    Object.keys(directionOptions).forEach((key) => {
      if (!this.directions[key]) {
        this.directions[key] = this.createDirection(directionOptions[key]);
      } else {
        this.directions[key].addOptions(directionOptions[key]);
      }
      this.extent = ol.extent.extend(this.extent, this.directions[key].footPrintsLayer.getSource()
        .getExtent());
    });
  }

  createDirection(options) {
    return new Direction(options);
  }
  /**
   * @param {Object} json
   * @return {Object} version
   */
  static getVersion(json) {
    const version = {
      version: null,
      buildNumber: null,
    };

    if (json.version) {
      const number = json.version.match(/\d+\.\d+/);
      if (number) {
        version.version = Number(number[0]);
      }
      const buildNumber = json.version.match(/-\d+-/);
      if (buildNumber) {
        version.buildNumber = Number(buildNumber[0].match(/\d+/)[0]);
      }
    }
    return version;
  }

  /**
   * returns the image with the given name
   * @param {string} name
   * @return {vcs.oblique.Image|null}
   */
  getImageByName(name) {
    const directions = Object.values(this.directions);
    for (let i = 0; i < directions.length; i++) {
      const direction = directions[i];
      if (direction.images[name]) {
        return direction.images[name];
      }
    }
    return null;
  }
}

export default Collection;
