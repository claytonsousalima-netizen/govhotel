# ============================================================
# Dockerfile — Gov Estancorp
#
# Build static SPA served by Nginx
# Target: linux/arm64 (AWS t4g.medium)
# ============================================================

FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY index.html /usr/share/nginx/html/
COPY manual.html /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

# Copy supabase schema (documentation only, not served)
# COPY supabase/ /usr/share/nginx/html/supabase/

# config.js will be mounted as a read-only bind-mount in docker-compose.yml
# This allows environment-specific configuration without rebuilding the image

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
