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
      const offlinePath = offlineImageStore.getImageOfflinePath(nextSource, ignoreQueryString);
      this.setState({ path: offlinePath });
      offlineImageStore.subscribe(source, this.handler, reloadImage, ignoreQueryString);
    }
  }

  componentWillUnmount(){
    const { source, ignoreQueryString } = this.props;
    if (source.uri) {
      offlineImageStore.unsubscribe(source, this.handler, ignoreQueryString);
    }
  }

  componentWillMount() {
    /**
     * Always download and update image in offline store if 'reloadImage' === 'always', however
     * Case 1: Show offline image if already exist
     * Case 2: Show Fallback image if given until image gets downloaded
     * Case 3: Never cache image if property 'reloadImage' === never
     */
    const { source, reloadImage, ignoreQueryString } = this.props;

    // TODO: check source type as 'ImageURISource'
    // Download only if property 'uri' exists
    if (source.uri) {
      // Get image offline path if already exist else it returns undefined
      const offlinePath = offlineImageStore.getImageOfflinePath(source, ignoreQueryString);
      this.setState({ path: offlinePath });

      // Subscribe so that we can re-render once image downloaded!
      offlineImageStore.subscribe(source, this.handler, reloadImage, ignoreQueryString);
    }
  }

  reload() {
    const { source, ignoreQueryString } = this.props;
    const offlinePath = offlineImageStore.getImageOfflinePath(source, ignoreQueryString);
    this.setState({ path: offlinePath });
    offlineImageStore.subscribe(source, this.handler, true, ignoreQueryString);
  }

  // this.props.fallBackSource // Show default image as fallbackImage(If exist) until actual image has been loaded.
  render() {
    const { fallbackSource, source, component } = this.props;
    let sourceImage = source;

    // Replace source.uri with offline image path instead waiting for image to download from server
    if (source.uri) {
      if (this.state.path) {
        sourceImage = {
          uri: FILE_PREFIX + this.state.path,
        };
      } else if (fallbackSource) { // Show fallback image until we download actual image if not able to download show fallback image only!
        sourceImage = fallbackSource;
      }
    }

    const componentProps = {
      ...this.props,
      source: sourceImage
    };

    if (component) {
      const Component = component;
      return (
        <Component { ...componentProps }>{ this.props.children }</Component>
      );
    }

    // Default component would be 'ImageBackground' to render
    return (
      <ImageBackground { ...componentProps }>{ this.props.children }</ImageBackground>
    );
  }

}

OfflineImage.propTypes = {
  //fallbackSource: PropTypes.int,
  component: PropTypes.func,
  reloadImage: PropTypes.bool,
  ignoreQueryString: PropTypes.bool,
  onLoadEnd: PropTypes.func,
};

export default OfflineImage;
