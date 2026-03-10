#!/bin/bash

# ============================================================
# FIRSAT ÜRÜN - Başlatma Scripti
# firsaturun.com - Türkiye'nin Fırsat Paylaşım Platformu
# ============================================================

APP_NAME="firsat-urun"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$APP_DIR/.pid"
LOG_FILE="$APP_DIR/app.log"
DEFAULT_PORT=3000

# Renk kodları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

logo() {
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════╗"
    echo "  ║     🛒 FIRSAT ÜRÜN - firsaturun.com   ║"
    echo "  ║   Gerçek fırsatlar, gerçek insanlar   ║"
    echo "  ╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

check_deps() {
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js bulunamadı! Lütfen Node.js 22+ kurun.${NC}"
        exit 1
    fi

    if [ ! -d "$APP_DIR/node_modules" ]; then
        echo -e "${YELLOW}📦 Bağımlılıklar yükleniyor...${NC}"
        cd "$APP_DIR" && npm install
        echo -e "${GREEN}✅ Bağımlılıklar yüklendi.${NC}"
    fi
}

get_port() {
    if [ -n "$2" ]; then
        echo "$2"
    else
        echo "$DEFAULT_PORT"
    fi
}

start() {
    local PORT=$(get_port "$@")

    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${YELLOW}⚠️  $APP_NAME zaten çalışıyor (PID: $PID)${NC}"
            return 1
        else
            rm -f "$PID_FILE"
        fi
    fi

    check_deps

    echo -e "${GREEN}🚀 $APP_NAME başlatılıyor (Port: $PORT)...${NC}"
    cd "$APP_DIR"
    PORT=$PORT nohup node server.js > "$LOG_FILE" 2>&1 &
    local PID=$!
    echo $PID > "$PID_FILE"

    sleep 2
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${GREEN}✅ $APP_NAME başarıyla başlatıldı!${NC}"
        echo -e "${BLUE}🌐 Adres: http://localhost:$PORT${NC}"
        echo -e "${BLUE}📋 PID: $PID${NC}"
        echo -e "${BLUE}📄 Log: $LOG_FILE${NC}"
    else
        echo -e "${RED}❌ Başlatma başarısız! Log dosyasını kontrol edin: $LOG_FILE${NC}"
        rm -f "$PID_FILE"
        return 1
    fi
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${YELLOW}⚠️  $APP_NAME çalışmıyor.${NC}"
        return 1
    fi

    local PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${YELLOW}🛑 $APP_NAME durduruluyor (PID: $PID)...${NC}"
        kill "$PID"
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID"
        fi
        rm -f "$PID_FILE"
        echo -e "${GREEN}✅ $APP_NAME durduruldu.${NC}"
    else
        echo -e "${YELLOW}⚠️  İşlem bulunamadı. PID dosyası temizleniyor.${NC}"
        rm -f "$PID_FILE"
    fi
}

restart() {
    echo -e "${CYAN}🔄 $APP_NAME yeniden başlatılıyor...${NC}"
    stop
    sleep 1
    start "$@"
}

status() {
    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${GREEN}✅ $APP_NAME çalışıyor (PID: $PID)${NC}"
            echo -e "${BLUE}📊 Bellek kullanımı:${NC}"
            ps -p "$PID" -o pid,rss,vsz,%mem,%cpu,etime --no-headers 2>/dev/null | \
                awk '{printf "   PID: %s | RAM: %d MB | CPU: %s%% | Çalışma süresi: %s\n", $1, $2/1024, $5, $6}'
            return 0
        else
            echo -e "${RED}❌ $APP_NAME çalışmıyor (eski PID: $PID)${NC}"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        echo -e "${RED}❌ $APP_NAME çalışmıyor.${NC}"
        return 1
    fi
}

logs() {
    if [ -f "$LOG_FILE" ]; then
        echo -e "${CYAN}📄 Son 50 satır log:${NC}"
        tail -n 50 "$LOG_FILE"
    else
        echo -e "${YELLOW}⚠️  Log dosyası bulunamadı.${NC}"
    fi
}

help_menu() {
    logo
    echo -e "${CYAN}Kullanım:${NC} $0 {komut} [port]"
    echo ""
    echo -e "${GREEN}Komutlar:${NC}"
    echo -e "  ${BLUE}start [port]${NC}   Uygulamayı başlatır (varsayılan port: $DEFAULT_PORT)"
    echo -e "  ${BLUE}stop${NC}           Uygulamayı durdurur"
    echo -e "  ${BLUE}restart [port]${NC} Uygulamayı yeniden başlatır"
    echo -e "  ${BLUE}status${NC}         Uygulama durumunu gösterir"
    echo -e "  ${BLUE}logs${NC}           Son logları gösterir"
    echo -e "  ${BLUE}help${NC}           Bu yardım mesajını gösterir"
    echo ""
    echo -e "${CYAN}Örnekler:${NC}"
    echo -e "  $0 start          # 3000 portunda başlat"
    echo -e "  $0 start 8080     # 8080 portunda başlat"
    echo -e "  $0 restart 5000   # 5000 portunda yeniden başlat"
    echo -e "  $0 status         # Durum kontrolü"
    echo ""
}

# Ana komut yönlendirici
case "${1:-help}" in
    start)   logo; start "$@" ;;
    stop)    logo; stop ;;
    restart) logo; restart "$@" ;;
    status)  logo; status ;;
    logs)    logs ;;
    help|*)  help_menu ;;
esac
