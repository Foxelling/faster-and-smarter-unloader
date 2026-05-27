"use strict";

Blocks.unloader.speed = 60 / 180;

Blocks.unloader.buildType = () => extend(Unloader.UnloaderBuild, Blocks.unloader, {
    updateTile() {
        this.unloadTimer += this.delta();
        
        while (this.unloadTimer >= this.block.speed) {
            
            let item = this.sortItem;
            let transferred = false;
            
            let getValidPairs = (checkItem) => {
                let sources = [];
                let targets = [];
                let pairs = [];

                for (let i = 0; i < this.proximity.size; i++) {
                    let other = this.proximity.get(i);
                    if (!other.interactable(this.team)) continue;

                    // Поиск источника
                    if (other.items != null && other.items.get(checkItem) > 0) {
                        if (other.block.unloadable && !other.block.consumesItem(checkItem)) {
                            sources.push(other);
                        }
                    }

                    // Поиск приемника
                    if (other.acceptItem(this, checkItem) && !(other.block instanceof CoreBlock)) {
                        targets.push(other);
                    }
                }

                for (let s of sources) {
                    for (let t of targets) {
                        if (s == t) continue;
                        
                        // Запрет "Склад -> Склад"
                        if (s.block instanceof StorageBlock && t.block instanceof StorageBlock) continue;
                        
                        // КЛЮЧЕВОЙ ФИКС: Запрет "Транспорт -> Склад"
                        // Блокирует бесконечный цикл забора предметов обратно с пластаниевых конвейеров
                        if (s.block.group == BlockGroup.transportation && t.block instanceof StorageBlock) continue;
                        
                        pairs.push({ source: s, target: t });
                    }
                }
                return pairs;
            };

            let tryTransfer = (checkItem) => {
                let validPairs = getValidPairs(checkItem);
                if (validPairs.length > 0) {
                    if (this._rr == null) this._rr = 0;
                    this._rr++;
                    let pair = validPairs[this._rr % validPairs.length];
                    
                    pair.source.removeStack(checkItem, 1);
                    pair.target.handleItem(this, checkItem);
                    
                    return true;
                }
                return false;
            };

            if (item != null) {
                transferred = tryTransfer(item);
            } else {
                if (this._nullIndex == null) this._nullIndex = 0;
                let itemsArray = Vars.content.items().toArray();
                
                for (let n = 0; n < itemsArray.length; n++) {
                    let testItem = itemsArray[(this._nullIndex + n) % itemsArray.length];
                    
                    if (tryTransfer(testItem)) {
                        transferred = true;
                        this._nullIndex = (this._nullIndex + n + 1) % itemsArray.length;
                        break; 
                    }
                }
            }

            if (transferred) {
                this.unloadTimer -= this.block.speed;
            } else {
                this.unloadTimer = Math.min(this.unloadTimer, this.block.speed);
                break;
            }
        }
    }
});