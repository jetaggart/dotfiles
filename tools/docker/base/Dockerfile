FROM ubuntu:24.04

ARG DOTFILES_REPO=https://github.com/jetaggart/dotfiles
ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=1000

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
      sudo curl ca-certificates git build-essential \
      unzip xz-utils \
      neovim tmux zsh \
      ripgrep fd-find fzf jq \
      openssh-client gnupg locales \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

RUN if getent passwd $USER_UID > /dev/null; then userdel -r $(getent passwd $USER_UID | cut -d: -f1); fi \
    && if getent group $USER_GID > /dev/null; then groupdel $(getent group $USER_GID | cut -d: -f1); fi \
    && groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/zsh $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
WORKDIR /home/$USERNAME

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH=/home/$USERNAME/.bun/bin:$PATH

ARG NODE_VERSION=22.12.0
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz \
      -o /tmp/node.tar.xz \
    && sudo tar -xJ -f /tmp/node.tar.xz -C /opt \
    && sudo mv /opt/node-v${NODE_VERSION}-linux-arm64 /opt/node \
    && sudo ln -sf /opt/node/bin/node /usr/local/bin/node \
    && sudo ln -sf /opt/node/bin/npm /usr/local/bin/npm \
    && sudo ln -sf /opt/node/bin/npx /usr/local/bin/npx \
    && rm /tmp/node.tar.xz

RUN umask 022 \
    && mkdir -p ~/.npm-global \
    && npm config set prefix ~/.npm-global \
    && npm config set ignore-scripts true \
    && npm config set min-release-age 7
ENV PATH=/home/$USERNAME/.npm-global/bin:$PATH

RUN npm install -g @anthropic-ai/claude-code

RUN git clone $DOTFILES_REPO ~/code/dotfiles \
    && bash ~/code/dotfiles/tools/docker/base/linux-install.sh

USER root
COPY entrypoint.sh /usr/local/bin/dev-entrypoint
RUN chmod +x /usr/local/bin/dev-entrypoint
USER $USERNAME

WORKDIR /work
ENV TERM=xterm-256color
ENTRYPOINT ["/usr/local/bin/dev-entrypoint"]
CMD ["zsh", "-l"]
