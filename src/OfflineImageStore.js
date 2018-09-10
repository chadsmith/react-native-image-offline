import { AsyncStorage } from 'react-native';
import RNFetchBlob from 'rn-fetch-blob';

const SHA1 = require('crypto-js/sha1');

/**
 * Primary class responsible with all operations required to communicate with Offline Store!
 *
 */
class OfflineImageStore {

  // TODOs
  // A component should only subscribe only once
  constructor(name, storeImageTimeout) {
    if (!OfflineImageStore.instance) {
      OfflineImageStore.instance = this;
      this.entries = {};

      this.store = {
        name,// Application should set their own application store name.
        // Offline Image removed after given time in seconds.
        // Default: 3 days
        storeImageTimeout,
        debugMode: false,
      };
      // If it is `true` then we will remove expired images after given `storeImageTimeout`
      this.handlers = {};

      this.restore = this.restore.bind(this);
    }

    return OfflineImageStore.instance;
  }

  /**
   * Gives the Offline store cache base directory
   */
  getBaseDir = () => {
    return `${RNFetchBlob.fs.dirs.CacheDir}/${this.store.name}`;
  };

  /**
   * This would be the method to be called on app start so that you could prepare application offline
   * image dictionary with existing image uris and its local store path.
   *
   * Pass onCompletion callback function to get the restore completion state.
   */
  async restore (config, onRestoreCompletion) {
    if (config.name === undefined || config.name.length === 0) {
      throw 'Offline image store name is missing';
    }

    this.store.name = config.name;

    if (config.imageRemoveTimeout) {
      this.store.storeImageTimeout = config.imageRemoveTimeout;
    }

    if (config.debugMode === true) {
      this.store.debugMode = true;
    }

    // Restore existing entries:
    AsyncStorage.getItem(`@${this.store.name}:uris`, (err, uris) => { // On `getItems` completion

      // Assign uris to entry list cache(`this.entries`)
      Object.assign(this.entries, JSON.parse(uris));

      if (this.store.debugMode) {
        console.log('Restored offline images entry dictionary', this.entries);
      }

      // Remove Expired images from offline store and then call user given callback completion method !
      this._removeExpiredImages(onRestoreCompletion);
    });

  };

  /**
   * Removes all the images in the offline store.
   */
  clearStore = (onRestoreCompletion) => {
    // Remove from offline store
    return RNFetchBlob.fs.unlink(this.getBaseDir())
      .then(() => { // On completion
        if (this.store.debugMode) {
          console.log('Removed offline image store completely!');
        }
        // Empty all entries so that we should update offline Async storage
        this.entries = {};

        // Update offline Async storage
        this._updateAsyncStorage(onRestoreCompletion);

      })
      .catch((err) => {
        if (this.store.debugMode) {
          console.log('unable to remove offline store', err);
        }
      });
  };

  prefetch = (props) => {
    return this._getImage(props);
  }

  subscribe = async (handler, props) => {
    const { source } = props;
    const { uri } = source;

    if (!this.handlers[uri]) {
      this.handlers[uri] = [handler];
    } else {
      this.handlers[uri].push(handler);
    }

    // Get the image if already exist else download and notify!
    await this._getImage(props);
  };

  // Unsubscribe all the handlers for the given source uri
  unsubscribe = (handler, { source }) => {
    delete this.handlers[source.uri];
  };

  /**
   * Check whether given uri already exist in our offline cache!
   * @param uri uri to check in offline cache list
   */
  isImageExistOffline = (uri) => {
    return this.entries[uri] !== undefined;
  };

  _getExpiredImages = () => {
    const toBeRemovedImages = [];
    const uriList = Object.keys(this.entries);
    uriList.forEach((uri) => {
      const createdPlusDaysDate = this._addTime(this.entries[uri].createdOn, this.store.storeImageTimeout);
      // Image created date + EXPIRED_AFTER_DAYS is < current Date, then remove the image
      if (createdPlusDaysDate < new Date()) {
        toBeRemovedImages.push(uri);
      }
    });

    return toBeRemovedImages;
  };

  /**
   * Removes the downloaded offline images which are greater then given 'storeImageTimeout' in the config.
   */
  _removeExpiredImages = (onRestoreCompletion) => {
    const toBeRemovedImagePromises = [];
    const uriListToRemove = this._getExpiredImages();
    if (this.store.debugMode) {
      console.log('uris to remove from offline store', uriListToRemove);
    }
    uriListToRemove.forEach((uri) => {
      // Remove image from cache
      const unlinkPromise = RNFetchBlob.fs.unlink(`${this.entries[uri].basePath}/${this.entries[uri].localUriPath}`)
        .then(() => {
          // Delete entry from cache so that we should remove from offline Async storage
          delete this.entries[uri];
        })
        .catch((err) => {
          if (this.store.debugMode) {
            console.log('unable to remove image', uri, err);
          }
        });
      toBeRemovedImagePromises.push(unlinkPromise);
    });

    if (toBeRemovedImagePromises.length > 0) {
      if (this.store.debugMode) {
        console.log('Found images to remove:');
      }
      Promise.all(toBeRemovedImagePromises)
        .then((results) => {
          if (this.store.debugMode) {
            console.log('removeExpiredImages completed callback');
          }

          // Update AsyncStorage with removed entries
          this._updateAsyncStorage(onRestoreCompletion);
        })
        .catch((e) => {
          //console.log('Promise.all', 'catch');
          if (this.store.debugMode) {
              console.log('removeExpiredImages error');
          }
          onRestoreCompletion();
        });
    } else { // Nothing to remove so just trigger callback!
      if (this.store.debugMode) {
        console.log('No images to remove:');
      }
      onRestoreCompletion();
    }
  };

  /**
   * Update AsyncStorage with entries cache and trigger callback.
   */
  _updateAsyncStorage = (onRestoreCompletionCallback) => {
    AsyncStorage.setItem(`@${this.store.name}:uris`, JSON.stringify(this.entries), () => {
      if (onRestoreCompletionCallback) {
        onRestoreCompletionCallback();
      }
    });
  };

  getImageOfflinePath = (props) => {
    const entry = this._getEntry(props);
    if(entry) {
      // Only exist if base directory matches
      if (entry.basePath === this.getBaseDir()) {
        if (this.store.debugMode) {
          console.log('Image exist offline', entry.localUriPath);
        }
        return `${entry.basePath}/${entry.localUriPath}`;
      }
    }
    if (this.store.debugMode) {
      console.log('Image not exist offline', props.source.uri);
    }
    return undefined;
  };

  _getImage = (props) => {
    const { reloadImage, source } = props;
    const { uri } = source;
    const entry = this._getEntry(props);

    // Image already exist
    if (entry) {
      // Only exist if base directory matches
      if (entry.basePath === this.getBaseDir()) {
        if (this.store.debugMode) {
          console.log('Image exist offline', uri);
        }
        // Notify subscribed handler
        this._notify(uri, entry);

        // Reload image:
        // Update existing image in offline store as server side image could have updated!
        if (reloadImage) {
          if (this.store.debugMode) {
            console.log('reloadImage is set to true for uri:', uri);
          }
          return this._downloadImage(props);
        }
      } else {
        return this._downloadImage(props);
      }
      return Promise.resolve();
    }

    if (this.store.debugMode) {
      console.log('Image not exist offline', uri);
    }
    return this._downloadImage(props);
  };

  _downloadImage = (props) => {
    const { source } = props;
    const { headers, method='GET', uri } = source;
    const { hash, extension } = this._getEntryProps(props);
    const filename = `${hash}${extension}`;
    return RNFetchBlob
      .config({
        path: `${this.getBaseDir()}/${filename}`
      })
      .fetch(method, uri, headers)
      .then(() => {
        // Add entry to entry list!!
        const entry = this._addEntry(hash, filename);
        // Notify subscribed handler AND Persist entries to AsyncStorage for offline
        this._updateOfflineStore(uri, entry).done();
      })
      .catch(() => {
        if (this.store.debugMode) {
          console.log('Failed to download image', uri);
        }
      });
  };

  _notify = (uri, entry) => {
    const handlers = this.handlers[uri];
    if (handlers && handlers.length > 0) {
      handlers.forEach(handler => {
        if (this.store.debugMode) {
          console.log('Notify handler called', uri);
        }
        handler(uri, `${entry.basePath}/${entry.localUriPath}`);
      });
    }
  };

  _getEntry = (props) => {
    const { hash } = this._getEntryProps(props);
    return this.entries[hash];
  }

  _getEntryProps = (props) => {
    const { id, ignoreQueryString, source } = props;
    const { uri } = source;
    const path = uri.substring(uri.lastIndexOf('/')).split('?')[0];
    const extension = path.indexOf('.') === -1 ? '.jpg' : path.substring(path.lastIndexOf('.'));
    const hash = id ? id : SHA1(ignoreQueryString ? uri.split('?')[0] : uri);
    return { hash, extension };
  };

  _addEntry = (hash, localUriPath) => {
    // Save Downloaded date when image downloads for first time
    const entry = this.entries[hash];
    if(entry)
      return this.entries[hash] = {
        ...entry,
        basePath: this.getBaseDir(),
        localUriPath,
      };
    return this.entries[hash] = {
      createdOn: new Date().toString(),
      basePath: this.getBaseDir(),
      localUriPath,
    };
  };

  _updateOfflineStore = async (uri, entry) => {
    try {
      await AsyncStorage.setItem(`@${this.store.name}:uris`, JSON.stringify(this.entries));
      // Notify subscribed handler
      this._notify(uri, entry);
    } catch (error) {
      if (this.store.debugMode) {
        // Error saving data
        console.log('Offline image entry update failed', error);
      }
    }
  };

  _addTime = (date, seconds) => {
    var result = new Date(date);
    result.setSeconds(result.getSeconds() + seconds);
    return result;
  };
}

const instance = new OfflineImageStore('RN_Default_ImageStore', 259200);

Object.freeze(instance);

export default instance;
