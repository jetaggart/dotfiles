FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV HOME=/root
ENV TERM=xterm-256color

RUN apt-get update && apt-get install -y --no-install-recommends \
      bat \
      bind9-host \
      build-essential \
      ca-certificates \
      curl \
      dnsutils \
      docker.io \
      docker-compose-v2 \
      fd-find \
      file \
      fzf \
      gh \
      git \
      git-lfs \
      gnupg \
      htop \
      httpie \
      iproute2 \
      iputils-ping \
      jq \
      less \
      locales \
      lsof \
      man-db \
      mtr-tiny \
      ncurses-bin \
      ncurses-term \
      netcat-openbsd \
      openssh-client \
      openssh-server \
      postgresql-client \
      psmisc \
      redis-tools \
      ripgrep \
      socat \
      tar \
      tmux \
      traceroute \
      trash-cli \
      tree \
      unzip \
      wget \
      whois \
      xz-utils \
      yq \
      zsh \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

RUN chsh -s /usr/bin/zsh root

RUN mkdir -p /run/sshd \
    && { \
      echo 'PermitRootLogin yes'; \
      echo 'PasswordAuthentication no'; \
      echo 'PubkeyAuthentication yes'; \
      echo 'UsePAM no'; \
      echo 'UseDNS no'; \
      echo 'GSSAPIAuthentication no'; \
      echo 'AuthorizedKeysFile /root/.ssh/authorized_keys'; \
    } > /etc/ssh/sshd_config.d/99-dev.conf \
    && ssh-keygen -A

COPY tools/docker/base/ghostty.terminfo /tmp/ghostty.terminfo
RUN tic -x /tmp/ghostty.terminfo && rm /tmp/ghostty.terminfo

ARG CACHE_BUST=0

RUN NVIM_TAG=$(curl -fsSL https://api.github.com/repos/neovim/neovim/releases/latest | jq -r '.tag_name') \
    && curl -fsSL "https://github.com/neovim/neovim/releases/download/${NVIM_TAG}/nvim-linux-arm64.tar.gz" -o /tmp/nvim.tar.gz \
    && tar -xz -f /tmp/nvim.tar.gz -C /opt \
    && mv /opt/nvim-linux-arm64 /opt/nvim \
    && ln -sf /opt/nvim/bin/nvim /usr/local/bin/nvim \
    && rm /tmp/nvim.tar.gz

RUN LAZYGIT_VERSION=$(curl -fsSL https://api.github.com/repos/jesseduffield/lazygit/releases/latest | jq -r '.tag_name' | sed 's/^v//') \
    && curl -fsSL "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_arm64.tar.gz" -o /tmp/lazygit.tar.gz \
    && tar -xz -f /tmp/lazygit.tar.gz -C /tmp lazygit \
    && mv /tmp/lazygit /usr/local/bin/lazygit \
    && rm /tmp/lazygit.tar.gz

RUN NODE_VERSION=$(curl -fsSL https://nodejs.org/dist/index.json | jq -r 'first(.[].version)') \
    && curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-arm64.tar.xz" -o /tmp/node.tar.xz \
    && tar -xJ -f /tmp/node.tar.xz -C /opt \
    && mv /opt/node-${NODE_VERSION}-linux-arm64 /opt/node \
    && ln -sf /opt/node/bin/node /usr/local/bin/node \
    && ln -sf /opt/node/bin/npm /usr/local/bin/npm \
    && ln -sf /opt/node/bin/npx /usr/local/bin/npx \
    && rm /tmp/node.tar.xz

RUN GO_VERSION=$(curl -fsSL "https://go.dev/dl/?mode=json" | jq -r 'first(.[]).version') \
    && curl -fsSL "https://go.dev/dl/${GO_VERSION}.linux-arm64.tar.gz" -o /tmp/go.tar.gz \
    && tar -xz -f /tmp/go.tar.gz -C /opt \
    && ln -sf /opt/go/bin/go /usr/local/bin/go \
    && ln -sf /opt/go/bin/gofmt /usr/local/bin/gofmt \
    && rm /tmp/go.tar.gz

RUN curl -fsSL https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-unknown-linux-gnu.tar.gz \
      -o /tmp/uv.tar.gz \
    && tar -xz -f /tmp/uv.tar.gz -C /tmp \
    && mv /tmp/uv-aarch64-unknown-linux-gnu/uv /usr/local/bin/uv \
    && mv /tmp/uv-aarch64-unknown-linux-gnu/uvx /usr/local/bin/uvx \
    && rm -rf /tmp/uv.tar.gz /tmp/uv-aarch64-unknown-linux-gnu

RUN curl -fsSL https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz \
      -o /tmp/ngrok.tgz \
    && tar -xz -f /tmp/ngrok.tgz -C /usr/local/bin ngrok \
    && rm /tmp/ngrok.tgz

WORKDIR /root

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH=/root/.bun/bin:$PATH

RUN mkdir -p /root/.npm-global \
    && npm config set prefix /root/.npm-global \
    && npm config set ignore-scripts true
ENV PATH=/root/.npm-global/bin:$PATH

RUN npm install -g npm@latest

RUN npm install --ignore-scripts=false -g @anthropic-ai/claude-code pnpm yarn

RUN npm config set min-release-age 7

COPY . /root/code/dotfiles
RUN bash /root/code/dotfiles/tools/docker/base/linux-install.sh

COPY tools/docker/base/entrypoint.sh /usr/local/bin/dev-entrypoint
RUN chmod +x /usr/local/bin/dev-entrypoint

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/dev-entrypoint"]
CMD ["zsh", "-l"]
