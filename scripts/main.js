"use strict";

Blocks.unloader.speed = 60 / 180;

let fastItems = [];
Events.on(EventType.ClientLoadEvent, cons(e => {
    let seq = Vars.content.items();
    for(let i = 0; i < seq.size; i++) {
        fastItems.push(seq.get(i));
    }
}));

Blocks.unloader.buildType = () => extend(Unloader.UnloaderBuild, Blocks.unloader, {
    updateTile() {
        this.unloadTimer += this.delta();
        
        let pSize = this.proximity.size;

        if (pSize < 2) {
            this.unloadTimer = 0;
            return;
        }
        
        while (this.unloadTimer >= this.block.speed) {
            let transferred = false;
            let filter = this.sortItem;
            
            if (this._rot == null) this._rot = 0;
            this._rot++;

            searchLoop:
            for (let i = 0; i < pSize; i++) {
                let source = this.proximity.get((i + this._rot) % pSize);
                
                if (source.items == null || !source.block.unloadable || !source.interactable(this.team)) continue;

                if (source.items.total() === 0) continue;

                if (filter != null) {
                    if (source.items.get(filter) > 0 && !source.block.consumesItem(filter)) {
                        for (let j = 0; j < pSize; j++) {
                            if (i === j) continue;
                            let target = this.proximity.get((j + this._rot) % pSize);
                            
                            if (!target.interactable(this.team)) continue;
                            
                            if (target.block instanceof CoreBlock) continue;
                            if (source.block instanceof StorageBlock && target.block instanceof StorageBlock) continue;
                            if (source.block.group === BlockGroup.transportation && target.block instanceof StorageBlock) continue;

                            if (target.acceptItem(this, filter)) {
                                source.removeStack(filter, 1);
                                target.handleItem(this, filter);
                                transferred = true;
                                break searchLoop;
                            }
                        }
                    }
                } else {
                    for (let k = 0; k < fastItems.length; k++) {
                        let item = fastItems[k];
                        
                        if (source.items.get(item) > 0 && !source.block.consumesItem(item)) {
                            for (let j = 0; j < pSize; j++) {
                                if (i === j) continue;
                                let target = this.proximity.get((j + this._rot) % pSize);
                                
                                if (!target.interactable(this.team)) continue;
                                
                                if (target.block instanceof CoreBlock) continue;
                                if (source.block instanceof StorageBlock && target.block instanceof StorageBlock) continue;
                                if (source.block.group === BlockGroup.transportation && target.block instanceof StorageBlock) continue;

                                if (target.acceptItem(this, item)) {
                                    source.removeStack(item, 1);
                                    target.handleItem(this, item);
                                    transferred = true;
                                    break searchLoop;
                                }
                            }
                        }
                    }
                }
            }

            if (transferred) {
                this.unloadTimer -= this.block.speed;
            } else {
                this.unloadTimer = 0;
                break;
            }
        }
    }
});