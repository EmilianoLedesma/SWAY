import { Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';

export default function EasterEggVideo({ visible, onClose }) {
  const player = useVideoPlayer(require('../../assets/easter-egg.mp4'), (p) => {
    p.muted = true;
    p.loop = false;
  });

  useEffect(() => {
    if (!visible) return;
    player.currentTime = 0;
    player.play();
    const sub = player.addListener('playToEnd', onClose);
    return () => sub.remove();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <VideoView
          style={styles.video}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
});
