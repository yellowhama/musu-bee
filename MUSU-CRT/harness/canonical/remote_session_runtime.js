export class FixtureRemoteSessionAdapter {
  constructor(fixture) {
    this.fixture = fixture;
  }

  async attach(_webrtcSessionId) {
    if (this.fixture.attach_result.status !== "active") {
      throw new Error(this.fixture.attach_result.detail);
    }
  }

  async close(_webrtcSessionId) {
    if (this.fixture.close_result.status !== "closed") {
      throw new Error(this.fixture.close_result.detail);
    }
  }
}

export class RemoteSessionController {
  constructor(adapter) {
    this.adapter = adapter;
  }

  async attach(webrtcSessionId) {
    try {
      await this.adapter.attach(webrtcSessionId);
      return {
        webrtcSessionId,
        status: "active",
      };
    } catch (error) {
      return {
        webrtcSessionId,
        status: "error",
        detail: String(error),
      };
    }
  }

  async close(webrtcSessionId) {
    try {
      await this.adapter.close(webrtcSessionId);
      return {
        webrtcSessionId,
        status: "closed",
      };
    } catch (error) {
      return {
        webrtcSessionId,
        status: "error",
        detail: String(error),
      };
    }
  }
}
