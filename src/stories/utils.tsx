import {
  ArchiveBoxIcon,
  BoltIcon,
  CubeTransparentIcon,
  QueueListIcon,
  CubeIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { ResourceSchema, WingLocalSchema } from "@monadahq/wing-local-schema";
import classNames from "classnames";
import React from "react";

import { TreeMenuItem } from "@/components/TreeMenu";

import constructHubTree from "../assets/construct-hub-tree.json";

export const flattenTreeMenuItems = (items: TreeMenuItem[]): TreeMenuItem[] => {
  return items.flatMap((item) => {
    return [
      item,
      ...(item.children ? flattenTreeMenuItems(item.children) : []),
    ];
  });
};

export const WingSchemaToTreeMenuItems = (
  schema: WingLocalSchema,
): TreeMenuItem[] => {
  const tree: TreeMenuItem[] = [];
  const buildTree = (node: any, parent: TreeMenuItem | undefined) => {
    const item: TreeMenuItem = {
      id: node.path,
      label: node.id,
      children: [],
      parentId: parent?.id,
      icon: (
        <ResourceIcon
          resourceType={node.type}
          className="w-4 h-4"
          darkenOnGroupHover
        />
      ),
    };
    if (parent) {
      parent.children?.push(item);
    } else {
      tree.push(item);
    }
    if (node.children && Object.keys(node.children).length > 0) {
      // eslint-disable-next-line unicorn/no-array-for-each
      Object.keys(node.children).forEach((child: any) => {
        buildTree(node.children[child], item);
      });
    }
  };
  buildTree(schema.root, undefined);
  return tree;
};

// resource id is not unique, so we need to use the path
const getConstructHubResourcePaths = (): string[] => {
  const resourceIds: string[] = [];
  const getResourceIds = (node: any) => {
    if (isContHubResource(node)) {
      resourceIds.push(node.path);
    }
    if (node.children && Object.keys(node.children).length > 0) {
      // eslint-disable-next-line unicorn/no-array-for-each
      Object.keys(node.children).forEach((child: any) => {
        getResourceIds(node.children[child]);
      });
    }
  };
  getResourceIds(constructHubTree.tree.children["construct-hub-dev"]);
  return resourceIds;
};

const getRandomArrayOfResourcesPaths = (resourcesArray: any[]): string[] => {
  // random index array
  const arrayLength = Math.floor(Math.random() * 8);
  if (!arrayLength) return [];

  const indexArray = Array.from({ length: arrayLength }, () =>
    Math.floor(Math.random() * resourcesArray.length),
  );
  // random resource paths array
  const resourcePaths = [];
  for (let i = 0; i < arrayLength; i++) {
    // @ts-ignore
    resourcePaths.push(resourcesArray[indexArray[i]]);
  }
  return resourcePaths;
};

const isContHubResource = (node: any): boolean => {
  return node?.attributes?.["aws:cdk:cloudformation:type"] !== undefined;
};

const hubNodeTypeAndProps = (
  node: any,
): {
  type: string;
  props: Record<string, any>;
} => {
  if (isContHubResource(node)) {
    switch (node.attributes["aws:cdk:cloudformation:type"]) {
      case "AWS::S3::Bucket":
        return {
          type: "cloud.Bucket",
          props: {},
        };
      case "AWS::Lambda::Function":
        return {
          type: "cloud.Function",
          props: {
            sourceCodeFile: "func.js",
            sourceCodeLanguage: "javascript",
            environmentVariables: {
              FOO: "bar",
            },
          },
        };
      case "AWS::SQS::Queue":
        return { type: "cloud.Queue", props: { timeout: "3000" } };
      default:
        // TODO: update schema to support custom resources
        return { type: "cloud.Custom", props: {} };
    }
  } else {
    return { type: "constructs.Construct", props: {} };
  }
};

export const constructHubTreeToWingSchema = (): WingLocalSchema => {
  const tree: WingLocalSchema = {
    version: "1.0.0",
    root: {
      id: "App",
      path: "",
      type: "constructs.Construct",
      children: {},
    },
  };

  const resourcePathsArray = getConstructHubResourcePaths();

  // TODO: fix types
  const buildTree = (node: any, parent: any | undefined) => {
    const item: {
      path: string;
      children?: {};
      callers?: string[];
      callees?: string[];
      id: string;
      type: string;
      props: Record<string, any>;
    } = {
      id: node.id,
      path: node.path,
      ...hubNodeTypeAndProps(node),
    };

    if (isContHubResource(node)) {
      item.callers = getRandomArrayOfResourcesPaths(resourcePathsArray);
      item.callees = getRandomArrayOfResourcesPaths(resourcePathsArray);
    }

    if (node.children) {
      item.children = {};
    }
    if (parent) {
      parent.children[item.id] = item;
    } else {
      // @ts-ignore
      tree.root.children[item.id] = item;
    }
    if (node.children && Object.keys(node.children).length > 0) {
      // eslint-disable-next-line unicorn/no-array-for-each
      Object.keys(node.children).forEach((child: any) => {
        buildTree(node.children[child], item);
      });
    }
  };
  buildTree(constructHubTree.tree.children["construct-hub-dev"], undefined);
  return tree;
};

const getResourceIconComponent = (resourceType: ResourceSchema["type"]) => {
  switch (resourceType) {
    case "cloud.Bucket":
      return ArchiveBoxIcon;
    case "cloud.Function":
      return BoltIcon;
    case "cloud.Queue":
      return QueueListIcon;
    case "cloud.Endpoint":
      return GlobeAltIcon;
    case "constructs.Construct":
      return CubeTransparentIcon;
    default:
      return CubeIcon;
  }
};

const getResourceIconColors = (options: {
  resourceType: ResourceSchema["type"];
  darkenOnGroupHover?: boolean;
}) => {
  switch (options.resourceType) {
    case "cloud.Bucket":
      return [
        "text-orange-500 dark:text-orange-400",
        options.darkenOnGroupHover &&
          "group-hover:text-orange-600 dark:group-hover:text-orange-300",
      ];
    case "cloud.Function":
      return [
        "text-sky-500 dark:text-sky-400",
        options.darkenOnGroupHover &&
          "group-hover:text-sky-600 dark:group-hover:text-sky-300",
      ];
    case "cloud.Queue":
      return [
        "text-emerald-500 dark:text-emerald-400",
        options.darkenOnGroupHover &&
          "group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
      ];
    case "cloud.Endpoint":
      return [
        "text-sky-500 dark:text-sky-400",
        options.darkenOnGroupHover &&
          "group-hover:text-sky-600 dark:group-hover:text-sky-300",
      ];
    default:
      return [
        "text-slate-500 dark:text-slate-400",
        options.darkenOnGroupHover &&
          "group-hover:text-slate-600 dark:group-hover:text-slate-300",
      ];
  }
};

export interface ResourceIconProps extends React.SVGProps<SVGSVGElement> {
  resourceType: ResourceSchema["type"];
  darkenOnGroupHover?: boolean;
}

export const ResourceIcon = ({
  resourceType,
  darkenOnGroupHover,
  className,
  ...props
}: ResourceIconProps) => {
  const Component = getResourceIconComponent(resourceType);
  const colors = getResourceIconColors({ resourceType, darkenOnGroupHover });
  return <Component className={classNames(className, colors)} {...props} />;
};
