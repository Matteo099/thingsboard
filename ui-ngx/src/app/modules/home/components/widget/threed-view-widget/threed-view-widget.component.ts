///
/// Copyright © 2016-2023 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { PageComponent } from '@shared/components/page.component';
import { WidgetContext } from '@home/models/widget-component.models';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { ThreedModelLoaderService, ThreedUniversalModelLoaderConfig } from '@core/services/threed-model-loader.service';
import { ThreedDeviceGroupSettings, ThreedViewWidgetSettings } from './threed-models';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  formattedDataFormDatasourceData,
  mergeFormattedData,
  processDataPattern,
  fillDataPattern
} from '@core/utils';
import { ThreedNavigateScene } from './threed-nagivate-scene';
import { ENVIRONMENT_ID } from './threed-constants';



/*
Widget Type: Ultimi Valori
Widget settings: 
  1) tb-simple-card-widget-settings (from Simple Card)
  2) tb-map-widget-settings (from Image Map)

Per navigare tra le dashboard (ex click su un sensore) mettere a disposizione un Azione click (vedi Image Map -> Azioni) 
Per modificare la posizione , scala... vedi Markers Placement - Image Map (anche se forse è meglio aggiungere qualcosa sui settings anzichè utilizzare un altro widget)

UNA VOLTA CREATO IL WIDGET-CODE:
Per aggiungere in automatico il widget quando si installa thingsboard, aggiungere un file json con le varie properties alla posizione (path assoluto): 'thingsboard-3.4.4\application\src\main\data\json\system\widget_bundles'
Altrimenti, se si aggiunge il widget a mano (tramite librertia widget/amministratore) è necessario premere su modifica (edit / icon penna) ed aggiornare i vari settings (in avanzate).

*/
@Component({
  selector: 'tb-threed-view-widget',
  templateUrl: './threed-view-widget.component.html',
  styleUrls: ['./threed-view-widget.component.scss']
})
export class ThreedViewWidgetComponent extends PageComponent implements OnInit, AfterViewInit {

  settings: ThreedViewWidgetSettings;

  @Input()
  ctx: WidgetContext;

  @ViewChild('rendererContainer') rendererContainer?: ElementRef;

  public pointerLocked: boolean = false;

  private threedNavigateScene: ThreedNavigateScene;

  constructor(
    protected store: Store<AppState>,
    protected cd: ChangeDetectorRef,
    private threedModelLoader: ThreedModelLoaderService
  ) {
    super(store);

    this.threedNavigateScene = new ThreedNavigateScene();
  }

  ngOnInit(): void {
    this.ctx.$scope.threedViewWidget = this;
    this.settings = this.ctx.settings;

    console.log(this.settings);
    if (!this.settings.hoverColor || !this.settings.threedSceneSettings) {
      console.warn("ThreedViewWidgetSettings object empty!")
      return;
    }

    this.threedNavigateScene.updateValue(this.settings);
    this.threedNavigateScene.onPointerLockedChanged.subscribe(v => {
      this.pointerLocked = v;
      this.cd.detectChanges();
    });

    this.loadModels();
  }

  private loadModels() {
    this.loadEnvironment();
    this.loadDevices();
  }

  private loadEnvironment() {
    const config: ThreedUniversalModelLoaderConfig = {
      entityLoader: this.threedModelLoader.toEntityLoader(this.settings.threedSceneSettings.threedEnvironmentSettings),
      aliasController: this.ctx.aliasController
    }

    console.log(config);

    this.loadModel(config, ENVIRONMENT_ID, false);
  }

  private loadDevices() {
    this.settings.threedSceneSettings.threedDevicesSettings.threedDeviceGroupSettings.forEach((deviceGroup: ThreedDeviceGroupSettings) => {
      const loaders = this.threedModelLoader.toEntityLoaders(deviceGroup);
      loaders.forEach(entityLoader => {
        const config: ThreedUniversalModelLoaderConfig = {
          entityLoader,
          aliasController: this.ctx.aliasController
        }

        this.loadModel(config);
      })
    });
  }

  private loadModel(config: ThreedUniversalModelLoaderConfig, id?: string, hasTooltip: boolean = true) {
    if (!this.threedModelLoader.isConfigValid(config)) return;
          
    this.threedModelLoader.loadModelAsGLTF(config).subscribe(res => {
      this.threedNavigateScene.addModel(res.model, id ? id : res.entityId, hasTooltip);
    });
  }

  ngAfterViewInit() {
    this.threedNavigateScene.attachToElement(this.rendererContainer);
  }

  lockCursor() {
    this.threedNavigateScene.lockControls();
  }

  public onDataUpdated() {
    //console.log("\n\n\nonDataUpdated - datasources", this.ctx.datasources);
    //console.log("\n\n\nonDataUpdated - data", this.ctx.data);

    if (this.ctx.datasources.length > 0) {
      var tbDatasource = this.ctx.datasources[0];
      // TODO...
    }

    const data = this.ctx.data;
    let formattedData = formattedDataFormDatasourceData(data);
    if (this.ctx.latestData && this.ctx.latestData.length) {
      const formattedLatestData = formattedDataFormDatasourceData(this.ctx.latestData);
      formattedData = mergeFormattedData(formattedData, formattedLatestData);
    }

    // We associate the new data with the tooltip settings, according to the entity alias
    formattedData.forEach(fd => {
      this.settings.threedSceneSettings?.threedDevicesSettings?.threedDeviceGroupSettings?.forEach(deviceGroup => {
        if (deviceGroup.threedTooltipSettings.showTooltip) {
          if (deviceGroup.threedEntityAliasSettings.entityAlias == fd.aliasName) {
            const pattern = deviceGroup.threedTooltipSettings.tooltipPattern;
            const replaceInfoTooltipMarker = processDataPattern(pattern, fd);
            const content = fillDataPattern(pattern, replaceInfoTooltipMarker, fd);

            this.threedNavigateScene.updateLabelContent([fd.entityId, ENVIRONMENT_ID], content);
          }
        }
      });
    });

    //this.updateMarkers(formattedData, false, markerClickCallback);
  }

  /*
  updateMarkers(markersData: FormattedData[], updateBounds = true, callback?) {
    const rawMarkers = markersData.filter(mdata => !!this.extractPosition(mdata));

    rawMarkers.forEach(data => {
      const currentImage: MarkerImageInfo = safeExecute(this.settings.parsedMarkerImageFunction,
        [data, this.settings.markerImages, markersData, data.dsIndex]);
    });
  }*/

  public onResize(width: number, height: number): void {
    this.threedNavigateScene?.resize(width, height);
  }

  @HostListener('window:keyup', ['$event'])
  keyUpEvent(event: KeyboardEvent) {
    this.threedNavigateScene?.onKeyUp(event);
  }
  @HostListener('window:keydown', ['$event'])
  keyDownEvent(event: KeyboardEvent) {
    this.threedNavigateScene?.onKeyDown(event);
  }
  @HostListener('window:mousemove', ['$event'])
  public mousemove(event: MouseEvent): void {
    this.threedNavigateScene?.onMouseMove(event);
  }
  @HostListener('window:click', ['$event'])
  public mouseclick(event: MouseEvent): void {
    this.threedNavigateScene?.onMouseClick(event);
  }
}