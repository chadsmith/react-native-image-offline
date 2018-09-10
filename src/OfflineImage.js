import React from 'react';
import PropTypes from 'prop-types';
import { ImageBackground, Platform } from 'react-native';

import offlineImageStore from './OfflineImageStore';

const FILE_PREFIX = Platform.OS === 'ios' ? '' : 'file://';

/**
 * Wrapper class for React Image {@link https://facebook.github.io/react-native/docs/image.html}.
 * This component can get the cached image's device file path as source path.
 */
class OfflineImage extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      path: undefined,
    };

    this.handler = this.handler.bind(this);
  }

  /**
   * Callback function triggered after image downloaded or if already exist in offline store
   */
  handler = (sourceUri, path) => {
    const { onLoadEnd, source } = this.props;
    if (source && source.uri && source.uri === sourceUri) {
      this.setState({ path: path });
      if (path && onLoadEnd) {
        onLoadEnd(sourceUri);
      }
    }
  };

  shouldComponentUpdate(nextProps, nextState) {
    return this.state.path !== nextState.path;
  }

  componentWillReceiveProps(nextProps) {
    const { source } = this.props;
    const {
      source: nextSource,
      reloadImage,
      ignoreQueryString,
    } = nextProps;
    if (nextSource && source && nextSource.uri !== source.uri) {
      const offlinePath = offlineImageStore.getImageOfflinePath(nextProps);
      this.setState({ path: offlinePath });
      offlineImageStore.subscribe(this.handler, nextProps);
    }
  }

  componentWillUnmount(){
    const { source } = this.props;
    if (source.uri) {
      offlineImageStore.unsubscribe(this.handler, { source });
    }
  }

  componentWillMount() {
    /**
     * Always download and update image in offline store if 'reloadImage' === 'always', however
     * Case 1: Show offline image if already exist
     * Case 2: Show Fallback image if given until image gets downloaded
     * Case 3: Never cache image if property 'reloadImage' === never
     */
    const { source } = this.props;

    // TODO: check source type as 'ImageURISource'
    // Download only if property 'uri' exists
    if (source.uri) {
      // Get image offline path if already exist else it returns undefined
      const offlinePath = offlineImageStore.getImageOfflinePath(this.props);
      this.setState({ path: offlinePath });

      // Subscribe so that we can re-render once image downloaded!
      offlineImageStore.subscribe(this.handler, this.props);
    }
  }

  reload() {
    const offlinePath = offlineImageStore.getImageOfflinePath(this.props);
    this.setState({ path: offlinePath });
    offlineImageStore.subscribe(this.handler, this.props);
  }

  // this.props.fallBackSource // Show default image as fallbackImage(If exist) until actual image has been loaded.
  render() {
    const { fallbackSource, source, component, reloadImage, ignoreQueryString, ...rest } = this.props;
    const { path } = this.state;
    let sourceImage = source;

    // Replace source.uri with offline image path instead waiting for image to download from server
    if (source.uri) {
      if (path) {
        sourceImage = {
          uri: FILE_PREFIX + path,
        };
      } else if (fallbackSource) { // Show fallback image until we download actual image if not able to download show fallback image only!
        sourceImage = fallbackSource;
      }
    }

    const componentProps = {
      ...rest,
      source: sourceImage,
    };

    if (component) {
      const Component = component;
      return (
        <Component { ...componentProps } />
      );
    }

    // Default component would be 'ImageBackground' to render
    return (
      <ImageBackground { ...componentProps } />
    );
  }

}

OfflineImage.propTypes = {
  //fallbackSource: PropTypes.int,
  component: PropTypes.func,
  reloadImage: PropTypes.bool,
  id: PropTypes.string,
  ignoreQueryString: PropTypes.bool,
  onLoadEnd: PropTypes.func,
};

export default OfflineImage;
