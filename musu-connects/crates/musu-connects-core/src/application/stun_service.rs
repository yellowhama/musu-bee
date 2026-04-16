use std::net::{SocketAddr, UdpSocket};
use std::time::Duration;

pub struct StunService {
    stun_servers: Vec<String>,
}

impl StunService {
    pub fn new(stun_servers: Vec<String>) -> Self {
        Self {
            stun_servers: if stun_servers.is_empty() {
                vec!["stun.l.google.com:19302".to_string()]
            } else {
                stun_servers
            },
        }
    }

    pub async fn discover_public_addr(&self, local_port: u16) -> Result<SocketAddr, Box<dyn std::error::Error>> {
        let bind_addr = format!("0.0.0.0:{}", local_port);
        let socket = UdpSocket::bind(&bind_addr)?;
        socket.set_read_timeout(Some(Duration::from_secs(3)))?;

        // Manual STUN Binding Request (minimal)
        // Message Type: 0x0001 (Binding Request)
        // Message Length: 0x0000
        // Magic Cookie: 0x2112A442
        // Transaction ID: 12 random bytes
        let mut request = vec![0u8; 20];
        request[0..2].copy_from_slice(&0x0001u16.to_be_bytes());
        request[4..8].copy_from_slice(&0x2112A442u32.to_be_bytes());
        
        for server in &self.stun_servers {
            let server_addr: SocketAddr = server.parse().map_err(|_| format!("Invalid STUN server: {}", server))?;
            socket.send_to(&request, server_addr)?;

            let mut recv_buf = [0u8; 1024];
            match socket.recv_from(&mut recv_buf) {
                Ok((n, _)) => {
                    if n < 20 { continue; }
                    // Very basic parsing for MAPPED-ADDRESS (0x0001) or XOR-MAPPED-ADDRESS (0x0020)
                    // In a production app, use a proper parser, but for Phase 6 we manually extract if needed
                    // or fix stun-types usage. Let's try to find XOR-MAPPED-ADDRESS.
                    
                    let mut pos = 20;
                    while pos + 4 <= n {
                        let attr_type = u16::from_be_bytes([recv_buf[pos], recv_buf[pos+1]]);
                        let attr_len = u16::from_be_bytes([recv_buf[pos+2], recv_buf[pos+3]]) as usize;
                        pos += 4;
                        
                        if (attr_type == 0x0001 || attr_type == 0x0020) && pos + attr_len <= n {
                            // Simple extraction for IPv4
                            if recv_buf[pos+1] == 0x01 { // Family IPv4
                                let port = u16::from_be_bytes([recv_buf[pos+2], recv_buf[pos+3]]);
                                let ip = std::net::Ipv4Addr::new(recv_buf[pos+4], recv_buf[pos+5], recv_buf[pos+6], recv_buf[pos+7]);
                                
                                if attr_type == 0x0020 {
                                    // XOR logic
                                    let xport = port ^ 0x2112;
                                    let xip = u32::from_be_bytes([recv_buf[pos+4], recv_buf[pos+5], recv_buf[pos+6], recv_buf[pos+7]]) ^ 0x2112A442;
                                    return Ok(SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::from(xip)), xport));
                                }
                                return Ok(SocketAddr::new(std::net::IpAddr::V4(ip), port));
                            }
                        }
                        pos += (attr_len + 3) & !3; // Align to 4 bytes
                    }
                }
                Err(_) => continue,
            }
        }

        Err("STUN discovery failed or unsupported response".into())
    }
}
