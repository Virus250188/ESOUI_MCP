LibSetDetection = LibSetDetection or {}

local libName = "LibSetDetection"
local libVersion = 4
local libDebug = false 
local playerName = GetUnitName("player") 
local EM = GetEventManager() 

--[[ ----------------------- ]]
--[[ -- Internal Entities -- ]]
--[[ ----------------------- ]]
 
local BroadcastManager = {} 
local CallbackManager = {}   
local GroupManager = {}     
local SetManager = {}        
local SlotManager = {}       
local PlayerSets = {}       
local EmptySetManager = {}  
local LookupTables = {}
local Development = {}     

--[[ --------------- ]]
--[[ -- Templates -- ]]
--[[ --------------- ]]

local function Template_SlotCategorySubtables( initBody, initFront, initBack )
  _initBody = initBody or 0 
  _initFront = initFront or 0 
  _initBack = initBack or 0
  return { ["body"] = _initBody, ["front"] = _initFront, ["back"] = _initBack }
end

--[[ ------------------------------- ]]
--[[ -- Generic Utility Functions -- ]]
--[[ ------------------------------- ]]

local function IsNumber( n ) 
  return type(n) == "number"
end

local function IsString( str ) 
  return type(str) == "string"
end

local function IsTable(t)
  return type(t) == "table"
end

local function IsFunction(f)
  return type(f) == "function"
end

local function IsBool( b ) 
  return type(b) == "boolean"
end

local function InvertTable( t ) 
  local invertedT = {} 
  for k,v in pairs(t) do 
    invertedT[v] = k 
  end
  return invertedT
end

local function MergeTables(t1, t2)
  local t = {}
  for k, v in pairs(t1) do
     t[k] = v
  end
	for k, v in pairs(t2) do
	   t[k] = v
	end
	return t
end


--[[ ---------------------- ]]
--[[ -- Global Variables -- ]]
--[[ ---------------------- ]]
 
--- eventId
LSD_EVENT_SET_CHANGE = 1 
LSD_EVENT_DATA_UPDATE = 2

local events = {
  [LSD_EVENT_SET_CHANGE] = "SetChange", 
  [LSD_EVENT_DATA_UPDATE] = "DataUpdate", 
}


--- changeType
LSD_CHANGE_TYPE_DEACTIVATED = 1
LSD_CHANGE_TYPE_ACTIVATED = 2
LSD_CHANGE_TYPE_UPDATED = 3 

local changeTypes = {
  [LSD_CHANGE_TYPE_DEACTIVATED] = "deactivated", 
  [LSD_CHANGE_TYPE_ACTIVATED] = "activated", 
  [LSD_CHANGE_TYPE_UPDATED] = "updated",
}

--- unitType
LSD_UNIT_TYPE_PLAYER = 1 
LSD_UNIT_TYPE_GROUP = 2

local unitTypes = {
  [LSD_UNIT_TYPE_PLAYER] = "Player", 
  [LSD_UNIT_TYPE_GROUP] = "Group", 
}


--- activeType 
LSD_ACTIVE_TYPE_NONE = 0 
LSD_ACTIVE_TYPE_DUAL_BAR = 1
LSD_ACTIVE_TYPE_FRONT_BAR = 2
LSD_ACTIVE_TYPE_BACK_BAR = 3 

local activeTypes = {
  [LSD_ACTIVE_TYPE_NONE] = "None",
  [LSD_ACTIVE_TYPE_DUAL_BAR] = "Dual",
  [LSD_ACTIVE_TYPE_FRONT_BAR] = "Front",
  [LSD_ACTIVE_TYPE_BACK_BAR] = "Back",
}


--- setType 
LSD_SET_TYPE_NORMAL = 0 
LSD_SET_TYPE_MYSTICAL = 1 
LSD_SET_TYPE_UNDAUNTED = 2 
LSD_SET_TYPE_ABILITY_ALTERING = 3

local setTypes = {
  [LSD_SET_TYPE_NORMAL] = "normal", 
  [LSD_SET_TYPE_MYSTICAL] = "mystical", 
  [LSD_SET_TYPE_UNDAUNTED] = "undaunted", 
  [LSD_SET_TYPE_ABILITY_ALTERING] = "ability altering", 
}

--[[ --------------------- ]]
--[[ -- Local Variables -- ]]
--[[ --------------------- ]]

local slotCategories = {"body", "front", "back"}

local slotList = {
  ["body"] = {
    [EQUIP_SLOT_HEAD] = "Head",                   --  0
    [EQUIP_SLOT_NECK] = "Necklace",               --  1
    [EQUIP_SLOT_CHEST] = "Chest",                 --  2
    [EQUIP_SLOT_SHOULDERS] = "Shoulders",         --  3
    [EQUIP_SLOT_WAIST] = "Waist",                 --  6
    [EQUIP_SLOT_LEGS] = "Legs",                   --  8
    [EQUIP_SLOT_FEET] = "Feet",                   --  9
    [EQUIP_SLOT_RING1] = "Ring1",                 -- 11
    [EQUIP_SLOT_RING2] = "Ring2",                 -- 12
    [EQUIP_SLOT_HAND] = "Hand",                   -- 16
  },
  ["front"] = {
    [EQUIP_SLOT_MAIN_HAND] = "MainFront",         --  4
    [EQUIP_SLOT_OFF_HAND] = "OffFront",           --  5
  },
  ["back"] = {
    [EQUIP_SLOT_BACKUP_MAIN] = "MainBack",        -- 20
    [EQUIP_SLOT_BACKUP_OFF] = "OffBack",          -- 21
  }
}


local weaponSlotList = MergeTables( slotList["front"], slotList["back"] )
local equipSlotList = MergeTables( slotList["body"], weaponSlotList )


local twoHanderList = {
  [WEAPONTYPE_TWO_HANDED_SWORD] = "Greatsword",     --  4
  [WEAPONTYPE_TWO_HANDED_AXE] = "Battleaxe",        --  5
  [WEAPONTYPE_TWO_HANDED_HAMMER] = "Battlehammer",  --  6
  [WEAPONTYPE_BOW] = "Bow",                         --  8
  [WEAPONTYPE_HEALING_STAFF] = "Healingstaff",      --  9
  [WEAPONTYPE_FIRE_STAFF] = "Firestaff",            -- 12
  [WEAPONTYPE_FROST_STAFF] = "Froststaff",          -- 13
  [WEAPONTYPE_LIGHTNING_STAFF] = "Lightningstaff",  -- 15
}


local exceptionList = {
  [695] = { ["maxEquip"] = 5 }  -- Shattered-Fate
}


--[[ -------------------------------- ]]
--[[ -- Specific Utility Functions -- ]]
--[[ -------------------------------- ]]

local function CheckException(setId, attribute) 
  if not setId then return exceptionList end  -- returns entire list, if no setId is provided
  local hasExceptions = exceptionList[setId]  -- checks if there is an entry for the specific set
  if not attribute then return hasExceptions end  -- returns all entries for specific set 
  if not hasExceptions then return end  -- returns nil, if there are no entries
  local hasSpecificException = hasExceptions[attribute] -- checks for specific entry, if provided
  return hasSpecificException  -- returns the specific entry or nil
end


local function ConvertCharToUnitName( charName ) 
  return zo_strformat( SI_UNIT_NAME, charName )
end


local function GetSetId( slotId )
  local _, _, _, _, _, setId = GetItemLinkSetInfo( GetItemLink(BAG_WORN, slotId) )
  return setId
end


local function IsWeaponSlot( slotId )
  return weaponSlotList[slotId] ~= nil
end


local function IsTwoHander( slotId )
  local weaponType = GetItemWeaponType(BAG_WORN, slotId)
  return twoHanderList[weaponType] ~= nil
end


local function GetSetName( setId ) 
  local _, setName = GetItemSetInfo( setId )
  if setName == "" then setName = "Unknown Set" end
  return setName
end 


local function GetMaxEquip( setId )
  local _, _, _, _, _, maxEquipZos = GetItemSetInfo( setId ) 
  if maxEquipZos == 0 then maxEquipZos = 15 end
  maxEquip = CheckException(setId, "maxEquip") or maxEquipZos
  return maxEquip, maxEquipZos
end


local function ConvertToUnperfected( setId ) 
  local unperf = GetItemSetUnperfectedSetId( setId ) 
  if unperf == 0 then 
    return setId 
  else 
    return unperf 
  end
end


local function ExtendNumEquipData( numEquip ) 
  local numEquipExtended = ZO_DeepTableCopy(numEquip)
  for setId, _ in pairs( numEquip) do
    numEquipExtended[setId].setName = GetSetName(setId)
    numEquipExtended[setId].maxEquip = GetMaxEquip(setId) 
  end
  return numEquipExtended
end


--[[ ----------- ]]
--[[ -- Debug -- ]] 
--[[ ----------- ]]

local function ColorString(str, colorName) 
  local colorList = {
    ["green"] = "00ff00",  
    ["orange"] = "ff8800", 
    ["cyan"] = "00ffff", 
  }
  local colorHex = colorList[colorName]
  if colorHex then 
    return string.format( "|c%s%s|r", colorHex, str)
  else
    return str 
  end
end

local function debugMsg(id, msg) 
  d( zo_strformat("[<<1>> <<2>> - <<3>>] <<4>>", GetTimeString(), ColorString("LSD", "green"), ColorString(id, "cyan"), msg) )  
end

--[[ %%%%%%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ---------------------- %% ]]
--[[ %% -- Callback Manager -- %% ]]
--[[ %% ---------------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%%%%%% ]]

local REGISTRY_RESULT_SUCCESS = 0 
local REGISTRY_RESULT_INVALID_EVENT = 1
local REGISTRY_RESULT_INVALID_CALLBACK = 2 
local REGISTRY_RESULT_INVALID_UNIT_TYPE = 3 
local REGISTRY_RESULT_INVALID_PARAMETER = 4
local REGISTRY_RESULT_INVALID_NAME = 5
local REGISTRY_RESULT_DUPLICATE_NAME = 6
local REGISTRY_RESULT_UNKNOWN_NAME = 7

local registryResultCodes = {
  [REGISTRY_RESULT_SUCCESS] = "sucess", 
  [REGISTRY_RESULT_INVALID_EVENT] = "invalid eventId",
  [REGISTRY_RESULT_INVALID_CALLBACK] = "invalid callback",
  [REGISTRY_RESULT_INVALID_UNIT_TYPE] = "invalid unitType",
  [REGISTRY_RESULT_INVALID_PARAMETER] = "invalid parameter",
  [REGISTRY_RESULT_INVALID_NAME] = "invalid name", 
  [REGISTRY_RESULT_DUPLICATE_NAME] = "duplicate name", 
  [REGISTRY_RESULT_UNKNOWN_NAME] = "unknown_name",
}


function CallbackManager:Initialize() 
  self.debug = true

  --- initialize registry tables 
  self.registry = {}
  for _, eventName in ipairs(events) do 
    self.registry[eventName] = {}
    for _, unitTypeName in ipairs(unitTypes) do 
      self.registry[eventName][unitTypeName] = {}
    end
  end

end


local function IsValidEventSpecificParameter(eventId, param)
  if eventId == LSD_EVENT_SET_CHANGE then 
    if not param then return true end 
    if IsNumber(param) then return true end 
    if IsTable(param) then 
      for _, value in ipairs(param) do 
        if not IsNumber(value) then return false end 
      end
      return true 
    end
    return false 
  elseif eventId == LSD_EVENT_DATA_UPDATE then 
    return true 
  else 
    return false 
  end
end


local function ResultCode( resultCode )  
  --- debug esult
  if libDebug and CallbackManager.debug then 
    debugMsg("CM", "Result: "..registryResultCodes[resultCode])
  end
  return resultCode 
end


function CallbackManager:UpdateRegistry(action, eventId, name, callback, unitType, param)
  local eventName = events[eventId]
  local unitTypeName = unitTypes[unitType]
  --- debug requested update 
  if libDebug and self.debug then 
    local actionStr = action and "Register" or "Unregister" 
    local paramStr
    if param then 
      paramStr = zo_strformat("<<1>>", IsTable(param) and "paramTable" or param )
    else 
      paramStr = "noParam" 
    end 
    debugMsg("CM", zo_strformat("<<1>> '<<2>>' in <<3>>-<<4>> (<<5>>)", actionStr, name, eventName or "???", unitTypeName or "???", paramStr))
  end
  --- handle multiple registrations 
  if param then 
    if eventId == LSD_EVENT_SET_CHANGE and IsTable(param) then 
      local resultCodeList = {}
      for key, setFilterId in ipairs(param) do 
        resultCodeList[key] = self:UpdateRegistry(action, eventId, name, callback, unitType, setFilterId)
      end
      local combinedResultCode = 0 
      for key, resultCode in ipairs(resultCodeList) do 
        combinedResultCode = combinedResultCode + 10^(#resultCodeList-key)*resultCode 
      end
      return combinedResultCode
    end
  end
  --- early outs 
  if not eventName then return ResultCode(REGISTRY_RESULT_INVALID_EVENT) end  
  if not unitTypeName then return ResultCode(REGISTRY_RESULT_INVALID_UNIT_TYPE) end   
  if not IsString(name) then return ResultCode(REGISTRY_RESULT_INVALID_NAME) end  
  if not IsValidEventSpecificParameter(eventId, param) then return ResultCode(REGISTRY_RESULT_INVALID_PARAMETER) end
  --- define registry
  local registry = self.registry[eventName][unitTypeName]
  --- (un-)registration
  if eventId == LSD_EVENT_SET_CHANGE then --- Set Change
    return self:UpdateSetChangeRegistry( action, name, callback, registry, param ) 
  elseif eventId == LSD_EVENT_DATA_UPDATE then  --- Data Update
    return self:UpdateDataUpdateRegistry( action, name, callback, registry ) 
  end
end 



function CallbackManager:UpdateSetChangeRegistry( action, name, callback, registry, param )
  --- define callbackList
  param = param or 0
  local setIdFilter =  ConvertToUnperfected(param)
  registry[setIdFilter] = registry[setIdFilter] or {}
  local callbackList = registry[setIdFilter]
  --- (un-)registration
  if action then    
    if callbackList[name] then return ResultCode(REGISTRY_RESULT_DUPLICATE_NAME) end
    if IsFunction(callback) then 
      callbackList[name] = callback 
    else 
      return ResultCode(REGISTRY_RESULT_INVALID_CALLBACK)
    end
  else  
    if not callbackList[name] then return ResultCode(REGISTRY_RESULT_UNKNOWN_NAME) end 
    callbackList[name] = nil
  end 
  return ResultCode(REGISTRY_RESULT_SUCCESS)
end   --- End of "UpdateSetChangeRegistry"



function CallbackManager:UpdateDataUpdateRegistry( action, name, callback, registry ) 
  --- define callbackList
  local callbackList = registry
  --- (un-)registration
  if action then
    if callbackList[name] then return ResultCode(REGISTRY_RESULT_DUPLICATE_NAME) end
    if IsFunction(callback) then 
      callbackList[name] = callback 
    else 
      return ResultCode(REGISTRY_RESULT_INVALID_CALLBACK)
    end
    callbackList[name] = callback 
  else 
    if not callbackList[name] then return ResultCode(REGISTRY_RESULT_UNKNOWN_NAME) end 
    callbackList[name] = nil
  end
  return ResultCode(REGISTRY_RESULT_SUCCESS)
end   --- End of "UpdateDataUpdateRegistry"



function CallbackManager:FireCallbacks( eventId, unitType, setId, ... ) 
  --- local function
  local function _FireCallbacks(callbackList, ...) 
    if ZO_IsTableEmpty( callbackList ) then return end 
    for _, callback in pairs( callbackList ) do 
      callback(...) 
    end
  end
  --- define registry 
  local eventName = events[eventId]
  local unitTypeName = unitTypes[unitType]
  local registry = self.registry[eventName][unitTypeName]
  --- fire callbacks
  if eventId == LSD_EVENT_SET_CHANGE then 
    -- parameter: setId, changeType, unitTag, localPlayer, activeType
    _FireCallbacks( registry[0], ...)
    _FireCallbacks( registry[setId], ...)
    --- debug
    if libDebug and self.debug then 
      local p = {...}
      local eventDetails = zo_strformat("<<1>> (<<2>>) was <<3>> (active: <<4>>)", ColorString(GetSetName(p[1]),"orange"), p[1], ColorString(changeTypes[p[2]], "cyan"), ColorString(activeTypes[p[5]], "cyan") ) 
      debugMsg("CM", zo_strformat("Fire Callback: <<1>> for <<2>> (<<3>> - <<4>>): <<5>>", ColorString(eventName, "orange"), ColorString(GetUnitName(p[3]), "green"), p[3], p[4] and "local" or "remote", eventDetails ) )
    end
  elseif eventId == LSD_EVENT_DATA_UPDATE then 
    -- parameter: unitTag, localPlayer, numEquipList, activeList
    _FireCallbacks( registry, ... )
    --- debug
    if libDebug and self.debug then 
      local p = {...} 
      debugMsg("CM", zo_strformat("Fire Callback: <<1>> for <<2>> (<<3>> - <<4>>)", ColorString(eventName, "orange"), ColorString(GetUnitName(p[1]), "green"), p[1], p[2] and "local" or "remote" ) )
    end
  end
end   --- End of "FireCallbacks"


--[[ %%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ------------------ %% ]]
--[[ %% -- Set Manager --- %% ]]
--[[ %% ------------------ %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%% ]]

SetManager.__index = SetManager 

function SetManager:New( unitType, unitName )
  local SM = setmetatable({}, SetManager) 
  if unitType == LSD_UNIT_TYPE_PLAYER then 
    SM.debug = true
    SM.localPlayer = true
  elseif unitType == LSD_UNIT_TYPE_GROUP then 
    SM.debug = true
    SM.localPlayer = false
  end
  SM.unitType = unitType
  SM.rawData = {}
  SM.numEquipList = {} 
  SM.activeList  = {}
  return SM
end


function SetManager:UpdateData( newRawData, unitTag )
  self.debugHeader = zo_strformat( "SM <<1>> (<<2>>)", GetUnitName(unitTag), unitTag )
  if libDebug and self.debug then debugMsg( self.debugHeader, "Received new data" ) end
  self.unitTag = unitTag -- ensures always correct unitTag
  self:InitTables( newRawData )  -- updates archive and resets current 
  self:ConvertDataToUnperfected()   -- all perfected pieces are handled as unperfected  
  self:AnalyseData()  -- determines, which sets are active 
  local changeList = self:DetermineChanges()  -- determine, what has changed (un-)equip/ update
  self:FireCallbacks( changeList )  -- fire callbacks according to detected changes
end


function SetManager:InitTables( newRawData ) 
  self.archive = {} 
  self.archive["rawData"] = ZO_ShallowTableCopy(self.rawData)
  self.archive["numEquipList"] = ZO_ShallowTableCopy(self.numEquipList)
  self.archive["activeList"] = ZO_ShallowTableCopy(self.activeList)
  self.rawData = newRawData
  self.numEquipList = {}
  self.activeList = {}
end


function SetManager:ConvertDataToUnperfected() 
  --- initialize temporary tables
  local numEquipTemp = {}
  local listOfPerfected = {}
  local listOfNormal = {}
  --- check, if any perfected sets are equipped
  for setId, _ in pairs( self.rawData ) do 
    if GetItemSetUnperfectedSetId(setId) ~= 0 then 
      table.insert( listOfPerfected, setId ) 
    else 
      table.insert( listOfNormal, setId )
    end
  end
  --- add all normal sets to temporary 
  for _, setId in ipairs( listOfNormal ) do 
    numEquipTemp[setId] = ZO_ShallowTableCopy(self.rawData[setId]) 
  end
  --- add perfected count to corresponding unperfected version  
  for _, perfSetId in ipairs( listOfPerfected ) do 
    local unperfSetId = GetItemSetUnperfectedSetId(perfSetId) 
    if not numEquipTemp[unperfSetId] then 
    -- if no unperfected pieces are equipped, overwrite it with perfected
      numEquipTemp[unperfSetId] = ZO_ShallowTableCopy(self.rawData[perfSetId])
    else 
    -- if unperfected pieces are equipped, add perfected ones
      for slotCategory, numEquip in pairs( self.rawData[perfSetId] ) do 
        numEquipTemp[unperfSetId][slotCategory] = numEquipTemp[unperfSetId][slotCategory] + numEquip
      end
    end
  end
  self.numEquipList = numEquipTemp
  --- debug
  if libDebug and self.debug then 
    debugMsg( self.debugHeader, "Conversion of perfected to normal setIds" )
    if ZO_IsTableEmpty(listOfPerfected) then 
      d( ColorString("no conversion occured", "orange") ) 
    else 
      for _, id in ipairs(listOfPerfected) do 
        local unperfId  = GetItemSetUnperfectedSetId(id)
        d( zo_strformat("<<1>>: <<2>> --> <<3>>", ColorString(GetSetName(unperfId), "orange"), id, unperfId ) )
      end
    end
  end
end

function SetManager:AnalyseData() 
  for setId, numEquip in pairs( self.numEquipList ) do  

    local numBody = numEquip["body"]
    local numFront = numBody + numEquip["front"] 
    local numBack = numBody + numEquip["back"] 
    local maxEquip = GetMaxEquip(setId)
    
    local activeOnFront = numFront >= maxEquip
    local activeOnBack = numBack >= maxEquip

    local activeType = LSD_ACTIVE_TYPE_NONE

    if activeOnFront and activeOnBack then activeType = LSD_ACTIVE_TYPE_DUAL_BAR 
    elseif activeOnFront then activeType = LSD_ACTIVE_TYPE_FRONT_BAR 
    elseif activeOnBack then activeType = LSD_ACTIVE_TYPE_BACK_BAR
    end

    self.activeList[setId] = activeType
  end
  if libDebug and self.debug then 
    debugMsg( self.debugHeader, "Current set data after analysis")
    if ZO_IsTableEmpty(self.numEquipList) then 
      d( zo_strformat("<<1>>", ColorString("empty loadout", "cyan")))
    else 
      for setId, numEquip in pairs(self.numEquipList) do 
        local setStr = zo_strformat("[<<1>>] <<2>>", ColorString(tostring(setId), "cyan"), ColorString(GetSetName(setId), "orange")  )  
        local numEquipStr = zo_strformat("{body, front, back} = {<<1>>, <<2>>, <<3>>}", ColorString(tostring(numEquip.body), "orange"), ColorString(tostring(numEquip.front), "orange"), ColorString(tostring(numEquip.back), "orange"))
        local setTypeStr = zo_strformat("setType = <<1>>", ColorString(setTypes[LibSetDetection.GetSetType(setId)], "orange") ) 
        local activeTypeStr = zo_strformat("activeType = <<1>>", ColorString(activeTypes[self.activeList[setId]], "orange") ) 
        d( zo_strformat("<<1>> || <<2>> || <<3>> || <<4>>", setStr, setTypeStr, activeTypeStr, numEquipStr ) )
      end
    end
  end
end


function SetManager:DetermineChanges()  
  local changeList = { [LSD_CHANGE_TYPE_DEACTIVATED] = {}, [LSD_CHANGE_TYPE_ACTIVATED] = {}, [LSD_CHANGE_TYPE_UPDATED] = {} } 
  
  --- check if changes occured to currently equipped sets
  for setId, activeType in pairs( self.activeList ) do 
    local previousActiveType = self.archive.activeList[setId] or LSD_ACTIVE_TYPE_NONE
    if activeType ~= previousActiveType then -- only changes in activeType are of interest 
      if activeType > 0 and previousActiveType == 0 then table.insert( changeList[LSD_CHANGE_TYPE_ACTIVATED], setId )
      elseif activeType > 0 then table.insert( changeList[LSD_CHANGE_TYPE_UPDATED], setId ) --changeList[setId] = LSD_CHANGE_TYPE_UPDATED
      elseif activeType == 0 then table.insert( changeList[LSD_CHANGE_TYPE_DEACTIVATED], setId )--changeList[setId] = LSD_CHANGE_TYPE_DEACTIVATED 
      end
    end
  end
  --- check if any previously equipped set was unequipped 
  for setId, previousActiveType in pairs(self.archive.activeList ) do 
    if previousActiveType > 0 and not self.activeList[setId] then table.insert( changeList[LSD_CHANGE_TYPE_DEACTIVATED], setId ) end--changeList[setId] = LSD_CHANGE_TYPE_DEACTIVATED end
  end

  if libDebug and self.debug then 
    for changeType, setList in ipairs( changeList ) do 
      if ZO_IsTableEmpty(setList) then 
        debugMsg( self.debugHeader, zo_strformat("No set was <<1>>", ColorString(changeTypes[changeType], "orange" ) ) )
      else 
        debugMsg( self.debugHeader, zo_strformat("List of <<1>> sets:", ColorString(changeTypes[changeType], "orange" ) ) ) 
        for _, setId in ipairs(setList) do 
          d( zo_strformat("[<<1>>] <<2>> was <<3>>", ColorString(tostring(setId), "cyan"), ColorString(GetSetName(setId), "orange"), changeTypes[changeType] )  )  
        end
      end
    end
  end
  return changeList 
end


function SetManager:FireCallbacks( changeList ) 
  --- set change 
  for changeType, setList in ipairs (changeList) do 
    for _, setId in ipairs(setList) do 
      CallbackManager:FireCallbacks( LSD_EVENT_SET_CHANGE, self.unitType, setId, 
      setId, changeType, self.unitTag, self.localPlayer, self.activeList[setId] or LSD_ACTIVE_TYPE_NONE ) 
      if self.unitTag == "player" and GroupManager.isGrouped then -- fire events with player group tag 
        CallbackManager:FireCallbacks( LSD_EVENT_SET_CHANGE, LSD_UNIT_TYPE_GROUP, setId, 
        setId, changeType, GetLocalPlayerGroupUnitTag(), self.localPlayer, self.activeList[setId] or LSD_ACTIVE_TYPE_NONE ) 
      end  
    end
  end
  --- data update 
  CallbackManager:FireCallbacks( LSD_EVENT_DATA_UPDATE, self.unitType, nil, 
    self.unitTag, self.localPlayer, self.numEquipList, self.activeList)
  if self.unitTag == "player" and GroupManager.isGrouped then 
    CallbackManager:FireCallbacks( LSD_EVENT_DATA_UPDATE, LSD_UNIT_TYPE_GROUP, nil, 
    GetLocalPlayerGroupUnitTag(), self.localPlayer, self.numEquipList, self.activeList)
  end
  if libDebug and self.debug then 
    d("--------------------------------------------------") 
  end
end



--[[ ---------------------------- ]]
--[[ -- SetManager Exposed API -- ]]
--[[ ---------------------------- ]] 

function SetManager:GetSetActiveType( setId ) 
  return self.activeList[setId] or LSD_ACTIVE_TYPE_NONE
end

function SetManager:GetSetNumEquip( setId ) 
  local numEquip = self.numEquipList[setId] or Template_SlotCategorySubtables()
  return numEquip["body"], numEquip["front"], numEquip["back"]
end

function SetManager:GetSetData() 
  local setData = {}
  for setId, activeType in pairs( self.activeList ) do 
    setData[setId] = {}
    setData[setId].activeType = self.activeList[setId]
    setData[setId].numEquip = self.numEquipList[setId] or Template_SlotCategorySubtables()
    setData[setId].setName = GetSetName(setId) 
    setData[setId].maxEquip = GetMaxEquip(setId)
  end
  return setData
end

function SetManager:GetRawNumEquipList() 
  return  ZO_DeepTableCopy( self.rawData )
end


--[[ %%%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ------------------- %% ]]
--[[ %% -- Group Manager -- %% ]]
--[[ %% ------------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%%% ]]


function GroupManager:UpdateSetData( unitName, unitTag, data ) 
  if self.groupSets[unitName] then 
    self.groupSets[unitName]:UpdateData( data, unitTag ) 
  else 
    self.groupSets[unitName] = SetManager:New( LSD_UNIT_TYPE_GROUP )
    if libDebug and self.debug then 
      debugMsg("GM", zo_strformat("New data entry for <<1>>", ColorString(unitName, "green") ) ) 
    end
    self.groupSets[unitName]:UpdateData( data, unitTag )
  end
end


function GroupManager:GetSetManager( unitTag, provideEmptySM ) 
  local unitName = GetUnitName(unitTag)
  -- check if there exists a set manager 
  if self.groupSets[unitName] then 
    return self.groupSets[unitName]
  elseif unitName == playerName then 
    return PlayerSets
  else
    if provideEmptySM then return EmptySetManager end
  end
end 


function GroupManager:UpdateGroupMap() 
  self.groupMap = {}
  for ii = 1, GetGroupSize() do 
    local groupTag = GetGroupUnitTagByIndex(ii)
    if IsUnitPlayer(groupTag) then 
      self.groupMap[GetUnitName(groupTag)] = groupTag
    end
  end
  self.mapOutdated = false 
end


function GroupManager:AreUnitDataAvailable( unitTag )  
  local unitName = GetUnitName(unitTag) 
  if unitName == playerName then return true end 
  return self.groupSets[unitName] and true or false 
end


function GroupManager:Initialize() 
  self.debug = true
  self.isGrouped = IsUnitGrouped("player") 
  if self.isGrouped then 
    self:UpdateGroupMap()
  end
  self.groupSets = {}
  self.groupMap = {}
  self.mapOutdated = true 

  --- event callbacks
  local function OnGroupMemberJoined(_, charName, _, isLocalPlayer) 
    if isLocalPlayer then 
      GroupManager.isGrouped = true
      if libDebug and self.debug then 
        debugMsg("GM", zo_strformat("Local player <<1>>", ColorString("joined group", "orange") ) ) 
      end
      BroadcastManager:QueueBroadcast( PlayerSets.numEquipList, true, false )   
    end
  end
  
  local function OnGroupMemberLeft(_, charName, _, isLocalPlayer)
    if isLocalPlayer then 
      GroupManager.isGrouped = false 
      if libDebug and self.debug then 
        debugMsg("GM", zo_strformat("Local player <<1>>", ColorString("left group", "orange") ) ) 
      end
    else 
      local unitName = ConvertCharToUnitName(charName) 
      if libDebug and self.debug and GroupManager.groupSets[unitName] then 
        debugMsg("GM", zo_strformat("Removed data of <<1>> because they <<2>>", ColorString(unitName, "green"), ColorString("left group", "orange") ) ) 
      end 
      GroupManager.groupSets[unitName] = nil  
    end 
  end
  
  local function OnGroupUpdate() 
    self.mapOutdated = true 
  end

  local function OnGroupMemberConnectedStatus(_, unitTag, connected ) 
    local unitName = GetUnitName(unitTag) 
    if not connected then 
      GroupManager.groupSets[unitName] = nil 
      if libDebug and self.debug then 
        debugMsg("GM", zo_strformat("Removed data of <<1>> because they <<2>>", ColorString(unitName, "green"), ColorString("logged out", "orange") ) ) 
      end
    end
  end

  --- event registration 
  EM:RegisterForEvent(libName, EVENT_GROUP_MEMBER_JOINED, OnGroupMemberJoined )
  EM:RegisterForEvent(libName, EVENT_GROUP_MEMBER_LEFT, OnGroupMemberLeft )
  EM:RegisterForEvent(libName, EVENT_GROUP_UPDATE, OnGroupUpdate )
  EM:RegisterForEvent(libName, EVENT_GROUP_MEMBER_CONNECTED_STATUS, OnGroupMemberConnectedStatus)
end



--[[ %%%%%%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ---------------------- %% ]]
--[[ %% -- BroadcastManager -- %% ]]
--[[ %% ---------------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%%%%%% ]]



--[[ -------------- ]]
--[[ -- Data Msg -- ]]
--[[ -------------- ]]

DataMsg = {}

function DataMsg:SerilizeData( rawNumEquipList, requestSync ) 
  local LUT = LookupTables
  local formattedData = { 
    ["requestSync"] = requestSync, 
    ["mystical"] = 0, 
    ["NormalSets"] = {}, 
    ["WeaponSets"] = {},
    ["UndauntedSets"] = {},  
  }
  for setId, setData in pairs( rawNumEquipList ) do 
    local setType = LUT:GetSetType( setId ) 
    if setType == LSD_SET_TYPE_NORMAL then 
      table.insert(formattedData["NormalSets"], {
        id=setId, 
        body=setData.body, 
        front = setData.front, 
        back = setData.back} )
    elseif setType == LSD_SET_TYPE_MYSTICAL then
      formattedData["mystical"] = LUT:ExternalToInternalId("mystical", setId)
    elseif setType == LSD_SET_TYPE_UNDAUNTED then 
      table.insert(formattedData["UndauntedSets"], {
        id=LUT:ExternalToInternalId("undaunted", setId), 
        body = setData.body
      })
    elseif setType == LSD_SET_TYPE_ABILITY_ALTERING then 
      table.insert( formattedData["WeaponSets"], {
        id = LUT:ExternalToInternalId("weapon", setId),
        front = setData.front,
        back = setData.back
      })
    end
  end
  return formattedData
end


function DataMsg:DeserilizeData( rawData ) 
  local LUT = LookupTables
  local data = {}
  if not ZO_IsTableEmpty(rawData.WeaponSets) then 
    for _, setData in ipairs(rawData.WeaponSets) do 
      local setId = LUT:InternalToExternalId("weapon", setData.id )
      data[setId] = Template_SlotCategorySubtables( 0, setData.front, setData.back )
    end
  end
  if not ZO_IsTableEmpty(rawData.UndauntedSets) then 
    for _, setData in pairs(rawData.UndauntedSets) do 
      local setId = LUT:InternalToExternalId("undaunted", setData.id )
      data[setId] = Template_SlotCategorySubtables( setData.body )
    end
  end
  if rawData.mystical ~= 0 then 
    local setId = LUT:InternalToExternalId("mystical", rawData.mystical )
    data[setId] = Template_SlotCategorySubtables( 1 )
  end
  for _, setData in ipairs(rawData.NormalSets) do 
    data[setData.id] = Template_SlotCategorySubtables( setData.body, setData.front, setData.back )
  end
  return data, rawData.requestSync
end


function DataMsg:OnIncomingMsg(unitTag, rawData) 
  local unitName = GetUnitName(unitTag)
  if unitName == playerName then 
    if libDebug and self.debug then 
      debugMsg("BM", zo_strformat("Received broadcast from local player - <<1>>", ColorString("transmission verified", "orange") ) )
      d("--------------------------------------------------")  
    end
  else 
    local data, requestSync = self:DeserilizeData(rawData)
    if libDebug and self.debug then 
      debugMsg("BM", zo_strformat("Received Data from <<1>> (<<2>>) <<3>>", ColorString(unitName, "green"), ColorString(unitTag, "green"), requestSync and ColorString("sync requested", "orange") ) )
    end    
    if requestSync then 
      BroadcastManager:QueueBroadcast( PlayerSets.numEquipList, false, true )
    end
    GroupManager:UpdateSetData( unitName, unitTag, data ) 
  end
end


function DataMsg:SendData( rawNumEquipList ) 
  local requestSync = not BroadcastManager.synchronized
  local data = self:SerilizeData( rawNumEquipList, requestSync ) 
  if libDebug and self.debug then 
    debugMsg("BM", zo_strformat("Sending <<1>> of <<2>>; requestSync = <<3>>",ColorString("SetData", "orange"), ColorString("local player", "green"), ColorString(requestSync and "true" or "false", "orange") ) ) 
  end
  self.protocol:Send( data ) 
end


function DataMsg:InitMsgHandler() 
  if not LibGroupBroadcast then return end
  local LGB = LibGroupBroadcast
  local CreateArrayField = LGB.CreateArrayField
  local CreateTableField = LGB.CreateTableField 
  local CreateNumericField = LGB.CreateNumericField
  local CreateFlagField = LGB.CreateFlagField
  self.handler = LGB:RegisterHandler("LibSetDetection")
  self.handler:SetDisplayName("Lib Set Detection")
  self.handler:SetDescription("Shares equipped set pieces with group members.")
  self.protocol = self.handler:DeclareProtocol(40, "SetData")
  local normalSetsArray = CreateArrayField( CreateTableField("NormalSets", {
      CreateNumericField("id", { minValue = 0, maxValue = 1023 }),  --10 bit
      CreateNumericField("body", { minValue = 0, maxValue = 10 }),  -- 4 bit
      CreateNumericField("front", { minValue = 0, maxValue = 2 }),  -- 2 bit
      CreateNumericField("back", { minValue = 0, maxValue = 2 }),   -- 2 bit
    }), { minLength = 0, maxLength = 15 } )
  local weaponSetsArray = CreateArrayField( CreateTableField("WeaponSets", {
      CreateNumericField("id", { minValue = 0, maxValue = 63}),     -- 6 bit
      CreateNumericField("front", {minValue = 0, maxValue = 2}),    -- 2 bit 
      CreateNumericField("back", {minValue = 0, maxValue = 2}),     -- 2 bit
    }), { minLength = 0, maxLength = 2 } )  
  local undauntedSetsArray = CreateArrayField( CreateTableField("UndauntedSets", {
      CreateNumericField("id", { minValue = 0, maxValue = 127}),  -- 7 bit
      CreateNumericField("body", {minValue = 1, maxValue = 2})    -- 1 bit
    }), { minLength = 0, maxLength = 2 } )
  self.protocol:AddField( normalSetsArray ) -- 4 bit length + x*18 bit 
  self.protocol:AddField( weaponSetsArray ) -- 2 bit length +  x*10 bit
  self.protocol:AddField( undauntedSetsArray ) -- 2bit length + x*8 bit
  self.protocol:AddField( CreateNumericField("mystical", {minValue = 0, maxValue = 63} ) )
  self.protocol:AddField( CreateFlagField("requestSync") )
  self.protocol:OnData( function(...) self:OnIncomingMsg(...) end )  
  self.protocol:Finalize()
end

function DataMsg:Initialize(debug) 
  self.debug = debug
  self:InitMsgHandler() 
end

--[[ -------------------------- ]]
--[[ ----- End of DataMsg ----- ]]
--[[ -------------------------- ]]

function BroadcastManager:QueueBroadcast( rawNumEquipList, sendImmediately, forceSyncFlag )
  if not GroupManager.isGrouped then return end
  if not LibGroupBroadcast then return end

  if IsBool(forceSyncFlag) then 
    self.synchronized = forceSyncFlag
  end

  if sendImmediately then 
    if libDebug and self.debug then debugMsg("BM", zo_strformat("<<1>> broadcast", ColorString("Immediate", "orange") ) ) end
    self:SendData(rawNumEquipList) 
    return
  end

  if self.queueId then 
    zo_removeCallLater( self.queueId)
    if libDebug and self.debug then debugMsg("BM", zo_strformat("Broadcast Queue - <<1>>", ColorString("reset queue", "orange") ) ) end 
  else 
    if libDebug and self.debug then debugMsg("BM", zo_strformat("Broadcast Queue - <<1>>", ColorString("start queue", "orange") ) ) end
  end
  self.queueId = zo_callLater( function() 
    if libDebug and self.debug then debugMsg("BM", zo_strformat("Broadcast Queue - <<1>>", ColorString("execute queue", "orange") ) ) end
    self:SendData(rawNumEquipList) 
    self.queueId = nil 
  end, self.queueDuration) 

end


function BroadcastManager:SendData(rawNumEquipList) 
  DataMsg:SendData(rawNumEquipList)
  self.synchronized = true
end


function BroadcastManager:Initialize() 
  self.debug = true
  self.queueDuration = 3000
  self.synchronized = false 
  DataMsg:Initialize( self.debug ) 
end


--[[ %%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ------------------ %% ]]
--[[ %% -- Slot Manager -- %% ]]
--[[ %% ------------------ %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%% ]] 


function SlotManager:Initialize() 
  self.debug = true
  self.equippedGear = {} 
  for slotId, _ in pairs( equipSlotList ) do 
    self.equippedGear[slotId] = 0 
  end
  self.queueDuration = 1000 
end


function SlotManager:UpdateLoadout() 
  if libDebug and self.debug then debugMsg( "Slot", zo_strformat("Checking all equipment slots - <<1>>", ColorString("loadout update", "orange") ) ) end
  for slotId, _ in pairs (equipSlotList) do 
    self:UpdateSetId( slotId ) 
  end
  self:RelayData()  
end


function SlotManager:UpdateSlot( slotId ) 
  if libDebug and self.debug then debugMsg( "Slot", zo_strformat("Checking specific equipment slot - <<1>>", ColorString(equipSlotList[slotId].." update", "orange") ) )  end 
  self:UpdateSetId( slotId ) 
  self:ResetQueue() 
end


function SlotManager:UpdateSetId( slotId )
    -- keeping track, which slot has which set
    self.equippedGear[slotId] = GetSetId(slotId)
    -- if two-handers, assigns setId of main-hand to off-hand  
    if IsWeaponSlot( slotId ) then
      self.equippedGear[EQUIP_SLOT_OFF_HAND] = GetSetId( EQUIP_SLOT_OFF_HAND )
      self.equippedGear[EQUIP_SLOT_BACKUP_OFF] = GetSetId( EQUIP_SLOT_BACKUP_OFF )
      if IsTwoHander(EQUIP_SLOT_MAIN_HAND) then
        self.equippedGear[EQUIP_SLOT_OFF_HAND] = GetSetId(EQUIP_SLOT_MAIN_HAND)
      end
      if IsTwoHander(EQUIP_SLOT_BACKUP_MAIN) then
        self.equippedGear[EQUIP_SLOT_BACKUP_OFF] = GetSetId(EQUIP_SLOT_BACKUP_MAIN)
      end
    end  
end


function SlotManager:ResetQueue() 
  if self.queueId then 
    zo_removeCallLater( self.queueId )
    if libDebug and self.debug then debugMsg("Slot", zo_strformat("DataRelay Queue - <<1>>", ColorString("reset queue", "orange") ) ) end  
  else 
    if libDebug and self.debug then debugMsg("Slot", zo_strformat("DataRelay Queue - <<1>>", ColorString("start queue", "orange") ) ) end  
  end
  self.queueId = zo_callLater( function() 
    if libDebug and self.debug then debugMsg("Slot", zo_strformat("DataRelay Queue - <<1>>", ColorString("execute queue", "orange") ) ) end  
    self:RelayData()
    self.queueId = nil 
  end, self.queueDuration ) 
end


function SlotManager:ApplySpecialCases( numEquip ) 
  --- no need to populate tables for "no setId"
  numEquip[0] = nil
  --- ignore all other sets, when "Torq of the last ayleid king" mystical is equipped
  local ayleidKing = 693
  if numEquip[ayleidKing] then 
    for setId, data in pairs(numEquip) do 
      if setId ~= ayleidKing then numEquip[setId] = nil end 
    end
  end
  return numEquip 
end


function SlotManager:RelayData() 
  local rawNumEquipList = {} 
  for _, category in pairs(slotCategories) do  
    for slotId, _ in pairs( slotList[category]) do 
      local setId = self.equippedGear[slotId] 
      rawNumEquipList[setId] = rawNumEquipList[setId] or Template_SlotCategorySubtables() 
      rawNumEquipList[setId][category] = rawNumEquipList[setId][category] + 1
    end
  end 

  rawNumEquipList = self:ApplySpecialCases(rawNumEquipList) 

  if libDebug and self.debug then 
    debugMsg("Slot", zo_strformat("Relay data to <<1>> for <<2>> ", ColorString("SetManager", "orange"), ColorString("local player", "green") ) )
    if ZO_IsTableEmpty(rawNumEquipList) then 
      d( zo_strformat("Relayed data: <<1>>", ColorString("empty loadout", "cyan")))
    else 
      for setId, numEquip in pairs(rawNumEquipList) do 
        local setStr = zo_strformat("[<<1>>] <<2>>", ColorString(tostring(setId), "cyan"), ColorString(GetSetName(setId), "orange")  )  
        local numEquipStr = zo_strformat("{body, front, back} = {<<1>>, <<2>>, <<3>>}", ColorString(tostring(numEquip.body), "orange"), ColorString(tostring(numEquip.front), "orange"), ColorString(tostring(numEquip.back), "orange"))
        d( zo_strformat("<<1>>: <<2>>", setStr, numEquipStr ) )
      end
    end
  end

  PlayerSets:UpdateData( rawNumEquipList, "player" ) 
  BroadcastManager:QueueBroadcast( rawNumEquipList ) 
end


--[[ %%%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ------------------- %% ]]
--[[ %% -- Lookup Tables -- %% ]]
--[[ %% ------------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%%% ]]

function LookupTables:DefineSetIdMapping() 
  local mysticalList = {}
  local twoBoniSets = {} 
  for ii = 0, 2047 do 
    local maxEquip = GetMaxEquip( ii )
    if maxEquip == 1 then table.insert(mysticalList, ii) end
    if maxEquip == 2 then table.insert(twoBoniSets, ii) end 
  end 

  -- filter two boni into undaunted and abilityAltering 
  -- based on the fact that all abilityAltering sets have a perfected and normal version 
  local twoBoniSetsInverted = InvertTable(twoBoniSets)
  local abilityAlteringList = {}
  for setId, key in pairs( twoBoniSetsInverted ) do 
    local unperfSetId = GetItemSetUnperfectedSetId(setId)
    if unperfSetId ~= 0 then 
      table.insert( abilityAlteringList, unperfSetId )
      table.insert( abilityAlteringList, setId) 
      twoBoniSetsInverted[unperfSetId] = nil 
      twoBoniSetsInverted[setId] = nil
    end
  end

  self.internalId = {}
  self.internalId["mystical"] = InvertTable(mysticalList)  
  self.internalId["undaunted"] = twoBoniSetsInverted
  self.internalId["weapon"] = InvertTable(abilityAlteringList)

  self.externalId = {}
  self.externalId["mystical"] = mysticalList 
  self.externalId["undaunted"] = InvertTable(twoBoniSetsInverted)
  self.externalId["weapon"] = abilityAlteringList
end


function LookupTables:ExternalToInternalId(category, externalId)
  return self.internalId[category][externalId]
end


function LookupTables:InternalToExternalId(category, internalId)
  return self.externalId[category][internalId]
end


function LookupTables:GetSetType( setId )  
  if self:ExternalToInternalId("mystical", setId) then return LSD_SET_TYPE_MYSTICAL 
  elseif self:ExternalToInternalId("undaunted", setId) then return LSD_SET_TYPE_UNDAUNTED
  elseif self:ExternalToInternalId("weapon", setId) then return LSD_SET_TYPE_ABILITY_ALTERING
  else 
    return LSD_SET_TYPE_NORMAL 
  end
end


function LookupTables:Initialize() 
  self:DefineSetIdMapping()
end


--[[ %%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ---------------- %% ]]
--[[ %% -- ZOS Events -- %% ]]
--[[ %% ---------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%% ]]

local function OnInitialPlayerActivated() 
  EM:UnregisterForEvent( libName .."InitialPlayerActivated", EVENT_PLAYER_ACTIVATED)
  SlotManager:UpdateLoadout() 
end


local function OnSlotUpdate(_, _, slotId, _, _, _) 
  SlotManager:UpdateSlot(slotId)
end


local armorySetupChanged = false

local function OnArmoryOperation() 
  armorySetupChanged = true
end

local function OnPlayerModelRebuild() 
  if armorySetupChanged then 
    SlotManager:UpdateLoadout()
    armorySetupChanged = false
  end
end 



--[[ %%%%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% -------------------- %% ]]
--[[ %% -- Initialization -- %% ]]
--[[ %% -------------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%%%% ]]

local function Initialize() 

  if ExoYsDevelopmentTool then 
    libDebug = ExoYsDevelopmentTool.devMode[libName] 
  end

  LookupTables:Initialize()
  CallbackManager:Initialize()
  GroupManager:Initialize()
  BroadcastManager:Initialize() 
  SlotManager:Initialize() 

  PlayerSets = SetManager:New( LSD_UNIT_TYPE_PLAYER ) 
  EmptySetManager = SetManager:New( LSD_UNIT_TYPE_GROUP )

  --- Register Events 
  EM:RegisterForEvent( libName.."EquipChange", EVENT_INVENTORY_SINGLE_SLOT_UPDATE, OnSlotUpdate )
  EM:AddFilterForEvent( libName.."EquipChange", EVENT_INVENTORY_SINGLE_SLOT_UPDATE, REGISTER_FILTER_BAG_ID, BAG_WORN)
  EM:AddFilterForEvent( libName.."EquipChange", EVENT_INVENTORY_SINGLE_SLOT_UPDATE, REGISTER_FILTER_IS_NEW_ITEM, false)
  EM:AddFilterForEvent( libName.."EquipChange", EVENT_INVENTORY_SINGLE_SLOT_UPDATE, REGISTER_FILTER_INVENTORY_UPDATE_REASON , INVENTORY_UPDATE_REASON_DEFAULT)
  EM:RegisterForEvent( libName.."InitialPlayerActivated", EVENT_PLAYER_ACTIVATED, OnInitialPlayerActivated )
  EM:RegisterForEvent( libName.."ArmoryChange", EVENT_ARMORY_BUILD_OPERATION_STARTED, OnArmoryOperation )
  EM:RegisterForEvent( libName.."PlayerModelRebuild", EVENT_LOCAL_PLAYER_MODEL_REBUILT, OnPlayerModelRebuild) 
end

local function OnAddonLoaded(_, name) 
  if name == libName then 
    Initialize() 
    EM:UnregisterForEvent( libName, EVENT_ADD_ON_LOADED)
  end
end

EM:RegisterForEvent( libName, EVENT_ADD_ON_LOADED, OnAddonLoaded)


--[[ %%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% --------------- %% ]]
--[[ %% -- Interface -- %% ]]
--[[ %% --------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%% ]]

local function AccessSetManager( api, unitTag, setId ) 
  setId = ConvertToUnperfected(setId) 
  local SM  
  if unitTag == "player" then 
    SM = PlayerSets
  else 
    SM = GroupManager:GetSetManager( unitTag )
  end
  --- return values 
  if SM then 
    return SM[api](SM, setId)
  else 
    return 
  end
end

--[[ %%%%%%%%%%%%%%%%%%%%%%%%%%%%% ]]
--[[ %% ----------------------- %% ]]
--[[ %% -- Exposed Functions -- %% ]]
--[[ %% ----------------------- %% ]]
--[[ %%%%%%%%%%%%%%%%%%%%%%%%%%%%% ]]

--- Event (Un-)Registration 
-- eventId, name, callback, unitType, param
function LibSetDetection.RegisterEvent( eventId, name, callback, unitType, param ) 
  return CallbackManager:UpdateRegistry( true, eventId, name, callback, unitType, param)
end

function LibSetDetection.UnregisterEvent( eventId, name, unitType, param )
  return CallbackManager:UpdateRegistry( false, eventId, name, nil, unitType, param)
end


--- Standard Data Access 
function LibSetDetection.GetUnitSetActiveType( unitTag, setId )
  return AccessSetManager( "GetSetActiveType", unitTag, setId )
end

function LibSetDetection.GetUnitSetNumEquip( unitTag, setId )
  return AccessSetManager( "GetSetNumEquip", unitTag, setId )  
end

function LibSetDetection.GetUnitSetData( unitTag )
  return AccessSetManager( "GetSetData", unitTag  )
end


--- Raw Data Access 
function LibSetDetection.GetUnitRawNumEquipList( unitTag ) 
  return AccessSetManager( "GetRawNumEquipList", unitTag )
end

function LibSetDetection.GetPlayerEquippedGear( )
  return ZO_DeepTableCopy( SlotManager.equippedGear )
end


--- Data Availability 
function LibSetDetection.AreUnitDataAvailable( unitTag ) 
  local unitName = GetUnitName(unitTag) 
  if unitName == playerName then return true end 
  return GroupManager.groupSets[unitName] and true or false 
end

function LibSetDetection.GetAvailableUnitTags() 
  local GM = GroupManager 
  if GM.mapOutdated then GM:UpdateGroupMap() end 
  local availableTags = {}
  table.insert(availableTags, "player")
  for unitName, _ in pairs(GM.groupSets) do 
    table.insert( availableTags, GM.groupMap[unitName])
  end 
  if GM.isGrouped then table.insert(availableTags, GetLocalPlayerGroupUnitTag() ) end
  return availableTags 
end


--- Utility Functions
function LibSetDetection.ConvertActiveType( activeType ) 
  local activeTypeConversion = {
    [LSD_ACTIVE_TYPE_NONE] = {false, false, false, false},
    [LSD_ACTIVE_TYPE_FRONT_BAR] = {true, false, true, false}, 
    [LSD_ACTIVE_TYPE_BACK_BAR] = {true, false, false, true}, 
    [LSD_ACTIVE_TYPE_DUAL_BAR] = {true, true, true, true},
  }
  if activeTypeConversion[activeType] then 
    local returnTable = activeTypeConversion[activeType]
    return returnTable[1], returnTable[2], returnTable[3], returnTable[4]
  else 
    return 
  end
end

function LibSetDetection.GetSetIdByItemLink( itemLink )
  local _, _, _, _, _, setId = GetItemLinkSetInfo( itemlink )
  return setId
end

function LibSetDetection.GetSetName( setId, withoutPerfectedString ) 
  if withoutPerfectedString then 
    return GetSetName( ConvertToUnperfected(setId) )
  else 
    return GetSetName( setId )
  end 
end 

function LibSetDetection.GetSetMaxEquip( setId )
  return GetMaxEquip( setId ) 
end


--- Set Type 
function LibSetDetection.GetSetType( setId ) 
  return LookupTables:GetSetType( ConvertToUnperfected(setId) ) 
end

local function IsSpecificSetType( setType, setId )
  return LookupTables:GetSetType( ConvertToUnperfected(setId) )  == setType 
end

function LibSetDetection.IsSetMystical( setId ) 
  return IsSpecificSetType( LSD_SET_TYPE_MYSTICAL, ConvertToUnperfected(setId) ) 
end

function LibSetDetection.IsSetUndaunted( setId ) 
  return IsSpecificSetType( LSD_SET_TYPE_UNDAUNTED, ConvertToUnperfected(setId) ) 
end

function LibSetDetection.IsSetAbilityAltering( setId ) 
  return IsSpecificSetType( LSD_SET_TYPE_ABILITY_ALTERING, ConvertToUnperfected(setId) ) 
end

--[[ ----------------------------- ]]
--[[ -- Backwards Compatibility -- ]]
--[[ -- for function used in V3 -- ]] 
--[[ --    according to esoui   -- ]]
--[[ ----------------------------- ]]

function LibSetDetection.GetEquippedSetsTable() 
  local PS = PlayerSets
  local returnTable = {}
  for setId, activeType in pairs( PS.activeList ) do 
    local setData = {}
    setData.name = GetSetName( setId ) 
    setData.maxEquipped = GetMaxEquip( setId ) 
    setData.numEquipped = PS.numEquipList[setId] 
    local _, activeOnBody, activeOnFront, activeOnBack = LibSetDetection.ConvertActiveType( activeType)
    setData.activeBar = {
        ["body"] = activeOnBody, 
        ["front"] = activeOnFront, 
        ["back"] = activeOnBack,
    }
    returnTable[setId] = setData 
  end
  return returnTable
end

--[[ ------------------- ]]
--[[ -- Chat Command  -- ]]
--[[ ------------------- ]]

local cmdList = {
  ["equipped"] = "list of the equipped set-pieces for each equipment slot",
  ["setid"] = "list of setIds, that include the provided search string (input: *search string*)",
  ["setname"] = "localized name of the set with the provided id (input: *setId*)",
  ["setdata"] = "overview of equipped set for all available units (optional input: *uniTag* - only output for specific unit)",
  ["groupsets"] = "overview of all known sets equipped in group with corresponding member",
  ["debug"] = "list of debug states of library modules",
}




SLASH_COMMANDS["/lsd"] = function( input ) 
  ---deserializ input 
  input = string.lower(input) 
  local param = {}
  for str in string.gmatch(input, "%S+") do
    table.insert(param, str)
  end

  local cmd = table.remove(param, 1) 
  
  if not cmd or cmd == ""  then 
    d( zo_strformat("[<<1>>] <<2>>", ColorString("LibSetDetection", "green"), "command overview") ) 
    for cmdName, cmdInfo in pairs( cmdList ) do 
      d( zo_strformat("<<1>> - <<2>>", ColorString(cmdName, "cyan"), cmdInfo) )
    end
    d("--------------------")
  elseif cmd == "equipped" then 
    local OutputSets = function(slotCategory) 
      d("--- "..ColorString(slotCategory, "cyan").." --- ")
      for slotId, slotName in pairs( slotList[string.lower(slotCategory)] ) do 
        local setId = GetSetId( slotId )
        d( zo_strformat("<<1>>: <<2>> (<<3>>)", slotName, ColorString(GetSetName(setId), "orange") , setId ) )
      end  
    end
    d( zo_strformat("[<<1>>] equipped sets:", ColorString("LibSetDetection", "green") ))
    OutputSets( "Body" )  
    OutputSets( "Front" ) 
    OutputSets( "Back" )
    d("--------------------")
  elseif cmd == "setid" then
    if IsString(param[1]) and param[1] ~= "" then 
      d( zo_strformat("[<<1>>] searching for sets with '<<2>>'...", ColorString("LibSetDetection", "green"), ColorString(param[1], "cyan") ) )
      local foundMatch = false
      for ii=0,1023,1 do 
        local setName = GetSetName(ii)
        if string.find( string.lower(setName), string.lower(param[1]) ) then 
          d( zo_strformat("(<<1>>) - <<2>>", ii, ColorString(setName, "orange") ) )
          foundMatch = true
        end
      end
      if not foundMatch then 
        d( ColorString("no match found", "cyan")  )
      end
    else 
      d( zo_strformat("[<<1>>] invalid input for search", ColorString("LibSetDetection", "cyan") ))
    end
  elseif cmd == "setname" then 
    local setId = tonumber(param[1])
    if IsNumber(setId) then  
      local setName = GetSetName(setId) 
      if setName == "" then 
        d( zo_strformat("[<<1>>] no set name found for <<2>> = <<3>>", ColorString("LibSetDetection", "green"), ColorString("setId", "cyan"), setId) ) 
      else 
        d( zo_strformat("[<<1>>] <<2>> (<<3>>)", ColorString("LibSetDetection", "green"), ColorString(GetSetName(setId), "orange"), setId) ) 
      end
    else 
      d( zo_strformat("[<<1>>] invalid input for search", ColorString("LibSetDetection", "green") ))
    end
  elseif cmd == "setdata" then
    local function OutputSetData(unitTag)
      local setData = LibSetDetection.GetUnitSetData(unitTag) 
      --d( ColorString(zo_strformat("<<1>> (<<2>>):", GetUnitName(unitTag), unitTag), "green")) 
      local numEquip = {0,0,0}
      for setId, setInfo in pairs(setData) do
        numEquip[1] = numEquip[1] + setInfo.numEquip.body
        numEquip[2] = numEquip[2] + setInfo.numEquip.front 
        numEquip[3] = numEquip[3] + setInfo.numEquip.back
        local setStr = zo_strformat("[<<1>>] <<2>>", ColorString(tostring(setId), "cyan"), ColorString(setInfo.setName, "orange")  )  
        local setTypeStr = zo_strformat("setType = <<1>>", ColorString(setTypes[LibSetDetection.GetSetType(setId)], "orange") ) 
        local activeTypeStr = zo_strformat("activeType = <<1>>", ColorString(activeTypes[setInfo.activeType], "orange") ) 
        local numEquipStr = zo_strformat("{body, front, back} = {<<1>>, <<2>>, <<3>>}", ColorString(tostring(setInfo.numEquip.body), "orange"), ColorString(tostring(setInfo.numEquip.front), "orange"), ColorString(tostring(setInfo.numEquip.back), "orange"))
        d( zo_strformat("<<1>> || <<2>> || <<3>> || <<4>>", setStr, setTypeStr, activeTypeStr, numEquipStr ) )
      end
      d( zo_strformat("<<1>>: <<2>>/10 (body); <<3>>/2 (front) <<4>>/2 (back)", ColorString("Total Equipped", "cyan"), numEquip[1], numEquip[2], numEquip[3]) )
    end
    
    if IsString(param[1]) and param[1] ~= "" then 
      if LibSetDetection.AreUnitDataAvailable(param[1]) then 
        d( zo_strformat("[<<1>>] setdata for <<2>> (<<3>>)", ColorString("LibSetDetection", "green"), ColorString(GetUnitName(param[1]), "green"), ColorString(param[1], "green") ))
        OutputSetData(param[1])  
      else 
        d( zo_strformat("[<<1>>] invalid input for setdata", ColorString("LibSetDetection", "green") ))
      end    
    else 
      d( zo_strformat("[<<1>>] setdata for <<2>> ", ColorString("LibSetDetection", "green"), ColorString("all units", "green") ))
      local unitList = LibSetDetection.GetAvailableUnitTags() 
      for _, unitTag in ipairs(unitList) do 
        d( zo_strformat("Unit: <<1>> (<<2>>)", ColorString(GetUnitName(unitTag), "green"), ColorString(unitTag, "green") ) )  
        OutputSetData(unitTag)
        d( "--------------------------------------------------")
      end
    end
  elseif cmd == "groupsets" then
    local groupSets = {} 
    for _, unitTag in pairs(LibSetDetection.GetAvailableUnitTags()) do 
      if unitTag ~= "player" then 
        local unitSets = LibSetDetection.GetUnitSetData(unitTag)  
        for setId, setData in pairs(unitSets) do 
          if setData.activeType > 0 then 
            groupSets[setId] = groupSets[setId] or {}
            table.insert( groupSets[setId], unitTag)
          end
        end
      end
    end
    d( zo_strformat("[<<1>>] all sets equipped in <<2>> ", ColorString("LibSetDetection", "green"), ColorString("group", "green") ) )
    for setId, units in pairs(groupSets) do 
      d( zo_strformat("[<<1>>] <<2>>:", setId, ColorString(GetSetName(setId), "orange") ) )
      for key, unitTag in pairs(units) do 
        d( zo_strformat("   <<1>>. <<2>> (<<3>>)", key, ColorString(GetUnitName(unitTag), "green"), ColorString(unitTag, "green") ) )   
      end
      d( "--------------------------------------------------")
    end
  elseif cmd == "debug" then 
    if param[1] == "toggle" then 
      libDebug = not libDebug 
      d( zo_strformat("[<<1>>] Library debug state switched: <<2>>", ColorString("LibSetDetection", "green"), ColorString(libDebug and "on" or "off", "orange") ) )
    else 
      d( zo_strformat("[<<1>>] Library debug state: <<2>>", ColorString("LibSetDetection", "green"), ColorString(tostring(libDebug), "orange") ) )  
      d( zo_strformat("<<1>>: <<2>>", ColorString("BroadcastManager", "cyan"), ColorString(tostring(BroadcastManager.debug), "orange") ) ) 
      d( zo_strformat("<<1>>: <<2>>", ColorString("CallbackManager", "cyan"), ColorString(tostring(CallbackManager.debug), "orange") ) ) 
      d( zo_strformat("<<1>>: <<2>>", ColorString("GroupManager", "cyan"), ColorString(tostring(GroupManager.debug), "orange") ) ) 
      d( zo_strformat("<<1>>: <<2>>", ColorString("SetManager - Player", "cyan"), ColorString(tostring(PlayerSets.debug), "orange") ) ) 
      d( zo_strformat("<<1>>: <<2>>", ColorString("SetManager - Group", "cyan"), ColorString(tostring(EmptySetManager.debug), "orange") ) ) 
      d( zo_strformat("<<1>>: <<2>>", ColorString("SlotManager", "cyan"), ColorString(tostring(SlotManager.debug), "orange") ) ) 
    end
  else 
    if cmd == "dev" then--and libDebug then 
      if param[1] == "registry" then 
        debugMsg("Dev", "Registry")
        d(CallbackManager.registry)
      elseif param[1] == "groupmap" then 
        debugMsg("Dev", "GroupMap") 
        d(GroupManager.groupMap)
      end
    else 
      d("[LibSetDetection] command unknown")
    end
  end
end



