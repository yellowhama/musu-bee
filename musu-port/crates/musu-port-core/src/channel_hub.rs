use dashmap::DashMap;
use tokio::sync::broadcast;

const CHANNEL_CAPACITY: usize = 64;

/// Fan-out broadcast hub keyed by channel name.
///
/// - Channels are created on first subscriber or first HTTP broadcast.
/// - Channels with zero receivers are garbage-collected via [`ChannelHub::gc`].
pub struct ChannelHub {
    channels: DashMap<String, broadcast::Sender<String>>,
}

impl ChannelHub {
    pub fn new() -> Self {
        Self {
            channels: DashMap::new(),
        }
    }

    /// Return the sender for `name`, creating the channel if it does not exist.
    pub fn get_or_create(&self, name: &str) -> broadcast::Sender<String> {
        self.channels
            .entry(name.to_string())
            .or_insert_with(|| {
                let (tx, _rx) = broadcast::channel(CHANNEL_CAPACITY);
                tx
            })
            .clone()
    }

    /// Subscribe to `name`, creating the channel if necessary.
    pub fn subscribe(&self, name: &str) -> broadcast::Receiver<String> {
        self.get_or_create(name).subscribe()
    }

    /// Broadcast `message` to all current subscribers of `name`.
    ///
    /// Returns the number of receivers that received the message, or 0 if
    /// the channel does not exist or has no subscribers.
    pub fn broadcast(&self, name: &str, message: String) -> usize {
        match self.channels.get(name) {
            Some(tx) => tx.send(message).unwrap_or(0),
            None => 0,
        }
    }

    /// Remove the channel for `name` if it currently has zero receivers.
    ///
    /// Call this after a WS subscriber disconnects to avoid accumulating empty
    /// channels indefinitely.
    pub fn gc(&self, name: &str) {
        let should_remove = self
            .channels
            .get(name)
            .map(|tx| tx.receiver_count() == 0)
            .unwrap_or(false);
        if should_remove {
            self.channels.remove(name);
        }
    }
}

impl Default for ChannelHub {
    fn default() -> Self {
        Self::new()
    }
}
